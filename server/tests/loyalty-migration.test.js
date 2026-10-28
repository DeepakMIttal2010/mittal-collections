import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Transactions (and so real write conflicts) need a replica set.
import "./setup-replset.js";
import User from "../models/User.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { applyLoyaltyPointsChange } from "../utils/loyaltyPoints.js";
import { migrateLegacyBalances, legacyLotKey } from "../utils/loyaltyMigration.js";
import { readOnlyGuard, ReadOnlyViolationError } from "../utils/readOnlyGuard.js";
import { createUser } from "./helpers.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 24 * 60 * 60 * 1000;

// A legacy customer: balance with keyless (pre-lot) ledger history.
const legacyCustomer = async (points = 70) => {
  const user = await createUser({ loyaltyPoints: points });
  await LoyaltyTransaction.create([
    { user: user._id, type: "earned", points: points - 20, balanceAfter: points - 20, createdAt: new Date(Date.now() - 60 * DAY) },
    { user: user._id, type: "earned", points: 20, balanceAfter: points, createdAt: new Date(Date.now() - 20 * DAY) },
  ]);
  return user;
};

const lotState = async (userId) => {
  const lots = await LoyaltyLot.find({ user: userId, status: "available" });
  return { count: lots.length, sum: lots.reduce((s, l) => s + l.remainingPoints, 0) };
};

// Runs `fn` only the first time this hook is reached in a run. (Not
// attempt === 1: right after --apply creates its indexes, a transaction can
// be retried a few times on a transient catalog-change error before its
// reads succeed.)
const onFirstRead = (fn) => {
  let fired = false;
  const calls = [];
  const hook = async (info) => {
    calls.push(info.attempt);
    if (fired) return undefined;
    fired = true;
    return fn(info);
  };
  return { hooks: { afterRead: hook }, calls };
};

// Resolves every caller once `parties` callers have arrived — forces two
// transactions to have both done their reads before either claims.
const barrier = (parties) => {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return () => {
    arrived += 1;
    if (arrived >= parties) release();
    return Promise.race([
      gate,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("barrier: the other run never reached its claim")), 15000),
      ),
    ]);
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("--apply concurrency", () => {
  // --apply creates the LoyaltyLot indexes on start-up. If they don't exist
  // yet, a transaction reading that collection right after can be retried
  // on a transient "pending catalog changes" error — and a run held open at
  // the barrier below would block that index build from finishing. Create
  // them once up front so the barrier only ever waits on the migration.
  beforeAll(async () => {
    await LoyaltyLot.createCollection().catch(() => {});
    await LoyaltyLot.createIndexes();
  });

  it("two overlapping --apply runs migrate a customer exactly once", async () => {
    const user = await legacyCustomer(70);
    const arrive = barrier(2);
    const runA = onFirstRead(() => arrive());
    const runB = onFirstRead(() => arrive());

    const [a, b] = await Promise.all([
      migrateLegacyBalances({ apply: true, hooks: runA.hooks }),
      migrateLegacyBalances({ apply: true, hooks: runB.hooks }),
    ]);

    // Both transactions read before either claimed — a genuine overlap.
    expect(runA.calls.length).toBeGreaterThanOrEqual(1);
    expect(runB.calls.length).toBeGreaterThanOrEqual(1);
    expect(a.totals.lotsCreated + b.totals.lotsCreated).toBe(2);
    expect(a.totals.usersFailed + b.totals.usersFailed).toBe(0);

    const reloaded = await User.findById(user._id);
    expect(reloaded.loyaltyLotsMigratedAt).toBeInstanceOf(Date);
    expect(reloaded.loyaltyPoints).toBe(70);
    expect(await lotState(user._id)).toEqual({ count: 2, sum: 70 });
  });

  it("several concurrent runs over several customers never create lots beyond a balance", async () => {
    const users = await Promise.all([30, 45, 70, 120].map((points) => legacyCustomer(points)));

    await Promise.all([1, 2, 3].map(() => migrateLegacyBalances({ apply: true })));

    for (const user of users) {
      const { sum } = await lotState(user._id);
      expect(sum).toBe((await User.findById(user._id)).loyaltyPoints);
    }
    const keys = await LoyaltyLot.distinct("key");
    expect(keys).toHaveLength(await LoyaltyLot.countDocuments());
  });

  it("a redemption committing mid-migration forces a retry from fresh reads", async () => {
    const user = await legacyCustomer(50);
    // A separate transaction that commits while the migration's is open,
    // between its reads and its claim.
    const race = onFirstRead(async () => {
      const spent = await applyLoyaltyPointsChange({
        userId: user._id,
        type: "redeemed",
        points: -30,
        key: "race-redeem",
      });
      expect(spent.taken).toBe(30);
    });

    const report = await migrateLegacyBalances({ apply: true, hooks: race.hooks });

    expect(race.calls.length).toBeGreaterThanOrEqual(2); // aborted and re-planned
    expect(report.totals.usersFailed).toBe(0);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(20);
    expect((await lotState(user._id)).sum).toBe(20); // the fresh balance, not the stale 50
  });

  it("a credit committing mid-migration is not double-counted", async () => {
    const user = await legacyCustomer(50);

    const race = onFirstRead(() =>
      applyLoyaltyPointsChange({
        userId: user._id,
        type: "admin_adjustment",
        source: "admin",
        points: 10,
        key: "race-credit",
      }),
    );

    await migrateLegacyBalances({ apply: true, hooks: race.hooks });

    expect(race.calls.length).toBeGreaterThanOrEqual(2);

    expect((await User.findById(user._id)).loyaltyPoints).toBe(60);
    expect(await lotState(user._id)).toEqual({ count: 3, sum: 60 }); // 10 credited + 50 legacy in 2 lots
  });

  it("rolls back the claim and the marker when the lot insert fails, then succeeds on rerun", async () => {
    const user = await legacyCustomer(70);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(LoyaltyLot, "create").mockRejectedValueOnce(new Error("insert failed"));

    const failed = await migrateLegacyBalances({ apply: true });
    expect(failed.totals.usersFailed).toBe(1);
    expect((await User.findById(user._id)).loyaltyLotsMigratedAt).toBeUndefined();
    expect(await LoyaltyLot.countDocuments({ user: user._id })).toBe(0);

    vi.restoreAllMocks();
    const retried = await migrateLegacyBalances({ apply: true });
    expect(retried.totals.lotsCreated).toBe(2);
    expect((await lotState(user._id)).sum).toBe(70);
  });

  it("reruns a completed migration as a no-op", async () => {
    const user = await legacyCustomer(70);
    await migrateLegacyBalances({ apply: true });
    const before = await LoyaltyLot.find({ user: user._id }).lean();

    const rerun = await migrateLegacyBalances({ apply: true });

    expect(rerun.totals.usersToMigrate).toBe(0);
    expect(rerun.totals.alreadyMigrated).toBe(1);
    expect(rerun.totals.lotsCreated).toBe(0);
    expect(await LoyaltyLot.find({ user: user._id }).lean()).toEqual(before);
  });

  it("enforces unique migration lot keys in the database", async () => {
    const user = await legacyCustomer(70);
    await migrateLegacyBalances({ apply: true });

    const indexes = await LoyaltyLot.collection.indexes();
    expect(indexes.some((index) => index.unique && index.key.key === 1)).toBe(true);

    await expect(
      LoyaltyLot.create({
        user: user._id,
        source: "legacy",
        originalPoints: 5,
        remainingPoints: 5,
        creditedAt: new Date(),
        expiresAt: new Date(Date.now() + DAY),
        key: legacyLotKey(user._id, 0),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe("readOnlyGuard plugin", () => {
  it("rejects model writes before they reach the database", async () => {
    const schema = new mongoose.Schema({ name: String });
    schema.plugin(readOnlyGuard);
    const Guarded = mongoose.model("GuardedForTest", schema);

    await expect(Guarded.create({ name: "x" })).rejects.toBeInstanceOf(ReadOnlyViolationError);
    await expect(Guarded.updateOne({}, { name: "y" })).rejects.toBeInstanceOf(ReadOnlyViolationError);
    await expect(Guarded.deleteMany({})).rejects.toBeInstanceOf(ReadOnlyViolationError);
    expect(await Guarded.countDocuments()).toBe(0);
  });
});

// The real script, in its own process (so Mongoose initialises exactly as it
// would in production), against a separate auth-enabled replica set.
describe("dry run (the actual script)", () => {
  let authSet;
  let rootClient;

  const uriFor = (db, user, pwd) => {
    const url = new URL(authSet.getUri());
    url.username = user;
    url.password = pwd;
    url.pathname = `/${db}`;
    url.searchParams.set("authSource", "admin");
    return url.toString();
  };

  const runScript = (uri, extraArgs = []) => {
    const out = path.join(os.tmpdir(), `loyalty-dryrun-${Date.now()}-${Math.random()}.json`);
    return new Promise((resolve) => {
      execFile(
        process.execPath,
        ["scripts/migrate-loyalty-lots.mjs", "--out", out, ...extraArgs],
        { cwd: SERVER_DIR, env: { ...process.env, MONGODB_URI: uri, NODE_ENV: "production" }, timeout: 60000 },
        (error, stdout, stderr) => {
          const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
          if (report) fs.unlinkSync(out);
          resolve({ code: error ? error.code : 0, stdout, stderr, report });
        },
      );
    });
  };

  const snapshot = async (db) => {
    const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
    const state = {};
    for (const name of collections) {
      state[name] = {
        docs: await db.collection(name).find().sort({ _id: 1 }).toArray(),
        indexes: await db.collection(name).indexes(),
      };
    }
    return { collections, state };
  };

  const seed = async (db) => {
    const legacy = await db.collection("users").insertOne({ name: "Legacy", email: "legacy@x.com", loyaltyPoints: 70 });
    const migrated = await db.collection("users").insertOne({
      name: "Done",
      email: "done@x.com",
      loyaltyPoints: 40,
      loyaltyLotsMigratedAt: new Date("2026-10-27T00:00:00Z"),
    });
    await db.collection("loyaltytransactions").insertMany([
      { user: legacy.insertedId, type: "earned", points: 50, balanceAfter: 50, createdAt: new Date(Date.now() - 60 * DAY) },
      { user: legacy.insertedId, type: "earned", points: 20, balanceAfter: 70, createdAt: new Date(Date.now() - 20 * DAY) },
    ]);
    await db.collection("loyaltylots").insertOne({
      user: migrated.insertedId,
      source: "legacy",
      originalPoints: 40,
      remainingPoints: 40,
      status: "available",
      creditedAt: new Date(),
      expiresAt: new Date(Date.now() + 300 * DAY),
      key: `legacy:${migrated.insertedId}:0`,
    });
    await db.collection("loyaltylots").createIndex({ key: 1 }, { unique: true });
  };

  beforeAll(async () => {
    authSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: "wiredTiger",
        auth: {
          enable: true,
          customRootName: "root",
          customRootPwd: "rootpw",
          extraUsers: [
            { createUser: "reader", pwd: "readerpw", roles: [{ role: "read", db: "ro_db" }], database: "admin" },
          ],
        },
      },
    });
    rootClient = new MongoClient(uriFor("admin", "root", "rootpw"));
    await rootClient.connect();
  }, 120000);

  afterAll(async () => {
    await rootClient?.close();
    await authSet?.stop();
  });

  it("creates no collections or indexes on an empty database", async () => {
    const result = await runScript(uriFor("empty_db", "root", "rootpw"));

    expect(result.code).toBe(0);
    expect(result.report.writeCommandsObserved).toEqual([]);
    expect(await rootClient.db("empty_db").listCollections().toArray()).toEqual([]);
  }, 60000);

  it("leaves documents, indexes, balances and markers exactly as they were, even with write access", async () => {
    const db = rootClient.db("seeded_db");
    await seed(db);
    const before = await snapshot(db);

    const result = await runScript(uriFor("seeded_db", "root", "rootpw"));

    expect(result.code).toBe(0);
    expect(result.report.mode).toBe("dry-run");
    expect(result.report.totals.usersToMigrate).toBe(1);
    expect(result.report.totals.alreadyMigrated).toBe(1);
    expect(result.report.writeCommandsObserved).toEqual([]);
    expect(await snapshot(db)).toEqual(before);
  }, 60000);

  it("runs with read-only credentials (and those credentials really are read-only)", async () => {
    const db = rootClient.db("ro_db");
    await seed(db);
    const before = await snapshot(db);

    const dryRun = await runScript(uriFor("ro_db", "reader", "readerpw"));
    expect(dryRun.code).toBe(0);
    expect(dryRun.report.totals.usersToMigrate).toBe(1);
    expect(dryRun.report.totals.unbatchedTotal).toBe(70);
    expect(dryRun.report.writeCommandsObserved).toEqual([]);

    const apply = await runScript(uriFor("ro_db", "reader", "readerpw"), ["--apply"]);
    expect(apply.code).not.toBe(0);
    expect(await snapshot(db)).toEqual(before);
  }, 120000);
});
