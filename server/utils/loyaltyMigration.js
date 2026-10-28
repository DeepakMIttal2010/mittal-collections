// One-off move of pre-batch loyalty balances into lots (see
// models/LoyaltyLot.js). Approved rule (owner, 2026-10-26): rebuild each
// customer's batches from their real ledger history — every credit is a
// batch dated when it actually happened, every deduction takes from the
// oldest batch first — and turn whatever the ledger can't explain into one
// "legacy" batch valid for 365 days from the migration date.
//
// It only ever splits the part of a balance not already covered by lots
// (the "unbatched" balance), never changes a balance, deletes anything or
// writes the ledger. Nothing is written without `apply: true`.
//
// Concurrency (several processes or instances may run --apply at once, and
// customers keep redeeming meanwhile): each customer is migrated in one
// transaction that reads their state, then claims them with a conditional
// write on their User document — marker absent AND balance unchanged — and
// creates the lots with deterministic keys (`legacy:<user>:<n>`, unique
// index). Any concurrent write to that User document (another run's claim,
// a redemption, a credit) makes one of the two transactions hit a write
// conflict; MongoDB aborts it and it is retried from fresh reads. The claim,
// the marker and the lots commit or roll back together, so a failed lot
// insert leaves the customer unmarked, and a marked customer is never
// migrated again.

import User from "../models/User.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import LoyaltySettings from "../models/LoyaltySettings.js";
import { lotExpiryFor } from "./loyaltyPoints.js";
import { withOptionalTransaction, transactionsSupported } from "./orderTransactions.js";

export class MigrationClaimError extends Error {
  constructor(userId) {
    super(`Migration claim for user ${userId} did not match — balance or marker changed`);
    this.code = "MIGRATION_CLAIM_CONFLICT";
  }
}

export const legacyLotKey = (userId, index) => `legacy:${userId}:${index}`;

// Pure: works out the lots for one customer's unbatched balance.
// legacyEntries: their ledger entries from before the batch scheme
// (no `key`), oldest first.
export const planLegacyLots = ({ unbatched, legacyEntries, migrationDate }) => {
  const replay = [];
  let unexplainedDeductions = 0;

  for (const entry of legacyEntries) {
    if (entry.points > 0) {
      replay.push({ creditedAt: new Date(entry.createdAt), remaining: entry.points });
      continue;
    }

    let take = -entry.points;
    for (const lot of replay) {
      if (take <= 0) break;
      const used = Math.min(take, lot.remaining);
      lot.remaining -= used;
      take -= used;
    }
    unexplainedDeductions += take;
  }

  let live = replay.filter((lot) => lot.remaining > 0);
  const reconstructed = live.reduce((sum, lot) => sum + lot.remaining, 0);

  // More history than balance: the difference was spent since (spending
  // takes the legacy balance first) — drop it from the oldest batches.
  let dropped = 0;
  let excess = Math.max(0, reconstructed - unbatched);
  for (const lot of live) {
    if (excess <= 0) break;
    const used = Math.min(excess, lot.remaining);
    lot.remaining -= used;
    excess -= used;
    dropped += used;
  }
  live = live.filter((lot) => lot.remaining > 0);

  const migrationExpiry = lotExpiryFor(migrationDate);
  const lots = live.map((lot) => {
    const expiresAt = lotExpiryFor(lot.creditedAt);
    // Never expire a legacy batch as a side effect of migrating it.
    const clamped = expiresAt <= migrationDate;
    return {
      source: "legacy",
      creditedAt: lot.creditedAt,
      points: lot.remaining,
      expiresAt: clamped ? migrationExpiry : expiresAt,
      clamped,
    };
  });

  const residual = Math.max(0, unbatched - (reconstructed - dropped));
  if (residual > 0) {
    lots.push({
      source: "legacy",
      creditedAt: migrationDate,
      points: residual,
      expiresAt: migrationExpiry,
      residual: true,
    });
  }

  return { lots, reconstructed: reconstructed - dropped, residual, dropped, unexplainedDeductions };
};

const loadUserState = async (userId, session) => {
  const user = await User.findById(userId)
    .select("name email loyaltyPoints loyaltyPointsOwed loyaltyLotsMigratedAt")
    .session(session);
  // Ledger rows can outlive their account (left behind by an older
  // deletion path) — reported, never migrated.
  if (!user) return null;
  const [lotAgg] = await LoyaltyLot.aggregate([
    { $match: { user: user._id, status: "available" } },
    { $group: { _id: null, total: { $sum: "$remainingPoints" } } },
  ]).session(session);
  const lotTotal = lotAgg?.total || 0;

  const legacyEntries = await LoyaltyTransaction.find({ user: user._id, key: { $exists: false } })
    .select("points createdAt type")
    .sort({ createdAt: 1, _id: 1 })
    .session(session)
    .lean();

  const [ledgerAgg] = await LoyaltyTransaction.aggregate([
    { $match: { user: user._id } },
    { $group: { _id: null, total: { $sum: "$points" } } },
  ]).session(session);

  return { user, lotTotal, legacyEntries, ledgerSum: ledgerAgg?.total || 0 };
};

// Migrates one customer. Returns the number of lots created (0 if there was
// nothing to do or they were already migrated). `hooks.afterRead` is a test
// seam that runs between the reads and the claim, inside the transaction.
const migrateUser = async (userId, migrationDate, hooks) => {
  let attempt = 0;

  // withTransaction already retries write conflicts (TransientTransactionError);
  // this outer loop only covers a claim that read clean but did not match.
  for (let round = 0; round < 3; round += 1) {
    try {
      return await withOptionalTransaction(async (session) => {
        attempt += 1;
        const fresh = await loadUserState(userId, session);
        if (!fresh || fresh.user.loyaltyLotsMigratedAt) return 0;

        const unbatched = fresh.user.loyaltyPoints - fresh.lotTotal;
        if (unbatched <= 0) return 0;

        const plan = planLegacyLots({ unbatched, legacyEntries: fresh.legacyEntries, migrationDate });

        if (hooks?.afterRead) await hooks.afterRead({ userId, attempt });

        const claim = await User.updateOne(
          {
            _id: fresh.user._id,
            loyaltyLotsMigratedAt: { $exists: false },
            loyaltyPoints: fresh.user.loyaltyPoints,
          },
          { $set: { loyaltyLotsMigratedAt: migrationDate } },
          { session },
        );

        if (claim.modifiedCount !== 1) throw new MigrationClaimError(userId);

        await LoyaltyLot.create(
          plan.lots.map((lot, index) => ({
            user: fresh.user._id,
            source: "legacy",
            originalPoints: lot.points,
            remainingPoints: lot.points,
            creditedAt: lot.creditedAt,
            expiresAt: lot.expiresAt,
            key: legacyLotKey(fresh.user._id, index),
            description: lot.residual
              ? "Balance from before batch expiry (no matching history)"
              : "Balance from before batch expiry",
          })),
          { session, ordered: true },
        );

        return plan.lots.length;
      });
    } catch (error) {
      if (!(error instanceof MigrationClaimError) || round === 2) throw error;
    }
  }

  return 0;
};

// --apply needs real transactions and the unique index on LoyaltyLot.key
// (the script connects with autoIndex off, so it is created explicitly).
const prepareForApply = async () => {
  if (!(await transactionsSupported())) {
    throw new Error("--apply needs MongoDB transactions (a replica set) — refusing to run");
  }

  await LoyaltyLot.createIndexes();
  const indexes = await LoyaltyLot.collection.indexes();
  if (!indexes.some((index) => index.unique && index.key?.key === 1)) {
    throw new Error("Unique index on LoyaltyLot.key is missing — refusing to run");
  }
};

export const migrateLegacyBalances = async ({
  apply = false,
  migrationDate = new Date(),
  hooks,
} = {}) => {
  if (apply) await prepareForApply();

  const [lotUsers, txUsers, pointUsers] = await Promise.all([
    LoyaltyLot.distinct("user"),
    LoyaltyTransaction.distinct("user"),
    User.distinct("_id", { $or: [{ loyaltyPoints: { $ne: 0 } }, { loyaltyPointsOwed: { $gt: 0 } }] }),
  ]);
  const userIds = [...new Set([...lotUsers, ...txUsers, ...pointUsers].map(String))];

  const rows = [];
  const totals = {
    usersScanned: 0,
    usersToMigrate: 0,
    alreadyMigrated: 0,
    migratedButUnbatched: 0,
    negativeBalances: 0,
    balanceTotal: 0,
    unbatchedTotal: 0,
    reconstructedPoints: 0,
    residualPoints: 0,
    droppedHistoryPoints: 0,
    clampedLots: 0,
    lotsPlanned: 0,
    lotsCreated: 0,
    usersFailed: 0,
    ledgerMismatches: 0,
    orphanedLedgerUsers: 0,
    lotsExceedBalance: 0,
  };

  for (const id of userIds) {
    const state = await loadUserState(id, null);
    if (!state) {
      totals.orphanedLedgerUsers += 1;
      continue;
    }

    totals.usersScanned += 1;
    totals.balanceTotal += state.user.loyaltyPoints;

    const migratedAt = state.user.loyaltyLotsMigratedAt || null;
    const unbatched = state.user.loyaltyPoints - state.lotTotal;
    const toMigrate = !migratedAt && unbatched > 0;
    const plan = toMigrate
      ? planLegacyLots({ unbatched, legacyEntries: state.legacyEntries, migrationDate })
      : { lots: [], reconstructed: 0, residual: 0, dropped: 0, unexplainedDeductions: 0 };

    const row = {
      userId: id,
      balance: state.user.loyaltyPoints,
      owed: state.user.loyaltyPointsOwed || 0,
      lotTotal: state.lotTotal,
      unbatched,
      migratedAt: migratedAt ? migratedAt.toISOString() : null,
      ledgerSum: state.ledgerSum,
      ledgerDiff: state.user.loyaltyPoints - state.ledgerSum,
      legacyEntries: state.legacyEntries.length,
      plan: plan.lots.map((lot) => ({
        points: lot.points,
        creditedAt: lot.creditedAt.toISOString(),
        expiresAt: lot.expiresAt.toISOString(),
        ...(lot.residual ? { residual: true } : {}),
        ...(lot.clamped ? { clamped: true } : {}),
      })),
      reconstructed: plan.reconstructed,
      residual: plan.residual,
      droppedHistory: plan.dropped,
      unexplainedDeductions: plan.unexplainedDeductions,
    };

    if (row.ledgerDiff !== 0) totals.ledgerMismatches += 1;
    if (state.user.loyaltyPoints < 0) totals.negativeBalances += 1;
    else if (unbatched < 0) totals.lotsExceedBalance += 1;
    if (migratedAt) {
      totals.alreadyMigrated += 1;
      // Never re-migrated — needs a human look.
      if (unbatched > 0) totals.migratedButUnbatched += 1;
    }

    if (toMigrate) {
      totals.usersToMigrate += 1;
      totals.unbatchedTotal += unbatched;
      totals.reconstructedPoints += plan.reconstructed;
      totals.residualPoints += plan.residual;
      totals.droppedHistoryPoints += plan.dropped;
      totals.clampedLots += plan.lots.filter((lot) => lot.clamped).length;
      totals.lotsPlanned += plan.lots.length;
    }

    if (apply && toMigrate) {
      // The plan above is only for the report — migrateUser re-reads and
      // re-plans inside its transaction.
      try {
        const created = await migrateUser(id, migrationDate, hooks);
        totals.lotsCreated += created;
        row.applied = created;
      } catch (error) {
        totals.usersFailed += 1;
        row.error = error.message;
        console.error(`[loyalty-migration] user ${id} failed:`, error.message);
      }
    }

    rows.push(row);
  }

  const settings = await LoyaltySettings.findOne().lean();

  return {
    mode: apply ? "apply" : "dry-run",
    migrationDate: migrationDate.toISOString(),
    settings: settings
      ? {
          earnRate: settings.earnRate,
          redeemValue: settings.redeemValue,
          maxRedeemPercent: settings.maxRedeemPercent,
          note:
            settings.maxRedeemPercent === 0.1
              ? "maxRedeemPercent already 10% — left untouched"
              : "maxRedeemPercent is not 10% — change it in Admin > Rewards settings (this migration never edits settings)",
        }
      : null,
    totals,
    rows,
  };
};
