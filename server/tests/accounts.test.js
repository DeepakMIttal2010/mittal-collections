import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import AccountGroup from "../models/AccountGroup.js";
import Ledger from "../models/Ledger.js";
import Voucher from "../models/Voucher.js";
import Role from "../models/Role.js";
import { AccountingSettings, AccountingLog } from "../models/AccountingMisc.js";
import { createUser, signToken } from "./helpers.js";
import { ensureAccountingSeed, createVoucher, paiseFromRupees } from "../utils/accounting.js";
import { PRIMARY_GROUPS, SEED_LEDGERS } from "../config/accountingDefaults.js";

const adminAuth = async () => {
  const admin = await createUser({ role: "admin" });
  return { Authorization: `Bearer ${signToken(admin)}` };
};

const staffAuth = async (permissions) => {
  const role = await Role.create({ name: `Role ${permissions.join("-") || "none"}`, permissions });
  const staff = await createUser({ role: "admin", adminRole: role._id });
  return { Authorization: `Bearer ${signToken(staff)}` };
};

const A = "/api/admin/accounts";

const ledgerIdByName = async (auth, name) => {
  const res = await request(app).get(`${A}/ledgers`).set(auth);
  return res.body.ledgers.find((l) => l.name === name)._id;
};

// A Payment voucher: Dr expense, Cr capital.
const paymentBody = async (auth, overrides = {}) => ({
  type: "Payment",
  date: "2026-10-05",
  narration: "Test payment",
  entries: [
    { ledger: await ledgerIdByName(auth, "Software Subscriptions"), side: "Dr", amount: 2500 },
    { ledger: await ledgerIdByName(auth, "Proprietor's Capital A/c"), side: "Cr", amount: 2500 },
  ],
  ...overrides,
});

describe("accounts: access control", () => {
  it("rejects anonymous, customer, and staff without the accounts permission", async () => {
    expect((await request(app).get(`${A}/ledgers`)).status).toBe(401);

    const customer = await createUser();
    const asCustomer = await request(app).get(`${A}/ledgers`).set("Authorization", `Bearer ${signToken(customer)}`);
    expect(asCustomer.status).toBe(403);

    const noPerm = await staffAuth(["expenses", "orders"]);
    for (const [method, path] of [["get", "/ledgers"], ["get", "/vouchers"], ["get", "/groups"], ["get", "/settings"]]) {
      expect((await request(app)[method](`${A}${path}`).set(noPerm)).status, path).toBe(403);
    }
    expect((await request(app).post(`${A}/vouchers`).set(noPerm).send({})).status).toBe(403);
  });

  it("allows staff whose role has the accounts permission", async () => {
    const ok = await staffAuth(["accounts"]);
    expect((await request(app).get(`${A}/ledgers`).set(ok)).status).toBe(200);
  });
});

describe("accounts: seed", () => {
  it("creates Tally-style groups, system ledgers, the SBI bank ledger, and default settings", async () => {
    const auth = await adminAuth();

    const groups = (await request(app).get(`${A}/groups`).set(auth)).body.groups;
    for (const g of PRIMARY_GROUPS) expect(groups.map((x) => x.name)).toContain(g.name);

    const sales = groups.find((g) => g.name === "Sales Accounts");
    expect(sales.section).toBe("trading");
    expect(groups.find((g) => g.name === "Indirect Expenses").section).toBe("profit-loss");
    const bank = groups.find((g) => g.name === "Bank Accounts");
    expect(bank.nature).toBe("Asset");
    expect(bank.section).toBe("balance-sheet");

    const ledgers = (await request(app).get(`${A}/ledgers`).set(auth)).body.ledgers;
    for (const l of SEED_LEDGERS) expect(ledgers.map((x) => x.name)).toContain(l.name);
    expect(ledgers.find((l) => l.name === "SBI A/C").group.name).toBe("Bank Accounts");
    expect(ledgers.find((l) => l.name === "SBI A/C").systemKey).toBeNull();
    expect(ledgers.find((l) => l.name === "Razorpay A/c").systemKey).toBe("razorpay");

    const settings = (await request(app).get(`${A}/settings`).set(auth)).body.settings;
    expect(settings.booksStartDate).toBe("2026-04-01");
    expect(settings.lockedThrough).toBeNull();
  });

  it("is idempotent, even for simultaneous first requests, and never overwrites an edited ledger", async () => {
    const auth = await adminAuth();

    const results = await Promise.all([1, 2, 3, 4].map(() => request(app).get(`${A}/ledgers`).set(auth)));
    expect(results.every((r) => r.status === 200)).toBe(true);

    const groupCount = await AccountGroup.countDocuments({});
    const ledgerCount = await Ledger.countDocuments({});

    const cash = await Ledger.findOne({ systemKey: "cash" });
    await Ledger.updateOne({ _id: cash._id }, { name: "Cash (shop drawer)", nameKey: "cash (shop drawer)" });

    await AccountingSettings.deleteMany({}); // force the seed to run again
    await ensureAccountingSeed();

    expect(await AccountGroup.countDocuments({})).toBe(groupCount);
    expect(await Ledger.countDocuments({})).toBe(ledgerCount);
    expect((await Ledger.findOne({ systemKey: "cash" })).name).toBe("Cash (shop drawer)");
  });
});

describe("accounts: groups", () => {
  it("creates a sub-group that inherits nature and section, and rejects duplicates", async () => {
    const auth = await adminAuth();
    const groups = (await request(app).get(`${A}/groups`).set(auth)).body.groups;
    const indirect = groups.find((g) => g.name === "Indirect Expenses");

    const res = await request(app).post(`${A}/groups`).set(auth).send({ name: "Travel", parent: indirect._id });
    expect(res.status).toBe(201);
    expect(res.body.group.nature).toBe("Expense");
    expect(res.body.group.section).toBe("profit-loss");
    expect(res.body.group.isPredefined).toBe(false);

    const dup = await request(app).post(`${A}/groups`).set(auth).send({ name: "  travel ", parent: indirect._id });
    expect(dup.status).toBe(400);

    for (const body of [{ name: "", parent: indirect._id }, { name: "X" }, { name: "X", parent: "nope" }, { name: "X", parent: { $ne: null } }, { name: { $gt: "" }, parent: indirect._id }]) {
      expect((await request(app).post(`${A}/groups`).set(auth).send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("protects standard groups and groups that are in use", async () => {
    const auth = await adminAuth();
    const groups = (await request(app).get(`${A}/groups`).set(auth)).body.groups;
    const cashGroup = groups.find((g) => g.name === "Cash-in-Hand");
    const indirect = groups.find((g) => g.name === "Indirect Expenses");

    expect((await request(app).put(`${A}/groups/${cashGroup._id}`).set(auth).send({ name: "Renamed" })).status).toBe(400);
    expect((await request(app).delete(`${A}/groups/${cashGroup._id}`).set(auth)).status).toBe(400);

    const travel = (await request(app).post(`${A}/groups`).set(auth).send({ name: "Travel", parent: indirect._id })).body.group;
    const renamed = await request(app).put(`${A}/groups/${travel._id}`).set(auth).send({ name: "Travel & Stay" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.group.name).toBe("Travel & Stay");

    await request(app).post(`${A}/ledgers`).set(auth).send({ name: "Taxi", group: travel._id });
    expect((await request(app).delete(`${A}/groups/${travel._id}`).set(auth)).status).toBe(400);

    const taxi = (await request(app).get(`${A}/ledgers`).set(auth)).body.ledgers.find((l) => l.name === "Taxi");
    await request(app).delete(`${A}/ledgers/${taxi._id}`).set(auth);
    expect((await request(app).delete(`${A}/groups/${travel._id}`).set(auth)).status).toBe(200);
  });
});

describe("accounts: ledgers", () => {
  it("creates a ledger with an opening balance and reports the opening difference", async () => {
    const auth = await adminAuth();
    const groups = (await request(app).get(`${A}/groups`).set(auth)).body.groups;
    const bank = groups.find((g) => g.name === "Bank Accounts");

    const res = await request(app).post(`${A}/ledgers`).set(auth).send({ name: "HDFC Current", group: bank._id, openingBalance: 15000.5, openingSide: "Dr" });
    expect(res.status).toBe(201);
    expect(res.body.ledger.openingPaise).toBe(1500050);

    const list = await request(app).get(`${A}/ledgers`).set(auth);
    const hdfc = list.body.ledgers.find((l) => l.name === "HDFC Current");
    expect(hdfc.opening).toBe(15000.5);
    expect(hdfc.closing).toBe(15000.5);
    expect(hdfc.closingSide).toBe("Dr");
    expect(list.body.openingDifference).toBe(15000.5); // Dr with no matching Cr yet

    const capitalId = await ledgerIdByName(auth, "Proprietor's Capital A/c");
    await request(app).put(`${A}/ledgers/${capitalId}`).set(auth).send({ openingBalance: 15000.5, openingSide: "Cr" });
    expect((await request(app).get(`${A}/ledgers`).set(auth)).body.openingDifference).toBe(0);
  });

  it("rejects duplicate names (case-insensitive) and invalid input", async () => {
    const auth = await adminAuth();
    const bank = (await request(app).get(`${A}/groups`).set(auth)).body.groups.find((g) => g.name === "Bank Accounts");

    expect((await request(app).post(`${A}/ledgers`).set(auth).send({ name: "sbi a/c", group: bank._id })).status).toBe(400);

    const bad = [
      { name: "", group: bank._id },
      { name: "X" },
      { name: "X", group: "nope" },
      { name: "X", group: { $ne: null } },
      { name: "X", group: bank._id, openingBalance: -5 },
      { name: "X", group: bank._id, openingBalance: "10" },
      { name: "X", group: bank._id, openingBalance: 10.123 },
      { name: "X", group: bank._id, openingBalance: 1e12 },
      { name: "X", group: bank._id, openingSide: "Debit" },
      { name: "X", group: bank._id, notes: "n".repeat(301) },
    ];
    for (const body of bad) {
      expect((await request(app).post(`${A}/ledgers`).set(auth).send(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await Ledger.countDocuments({ nameKey: "x" })).toBe(0);
  });

  it("protects system ledgers but allows renaming them", async () => {
    const auth = await adminAuth();
    const id = await ledgerIdByName(auth, "Razorpay A/c");
    const groups = (await request(app).get(`${A}/groups`).set(auth)).body.groups;
    const bank = groups.find((g) => g.name === "Bank Accounts");

    expect((await request(app).put(`${A}/ledgers/${id}`).set(auth).send({ group: bank._id })).status).toBe(400);
    expect((await request(app).put(`${A}/ledgers/${id}`).set(auth).send({ isActive: false })).status).toBe(400);
    expect((await request(app).delete(`${A}/ledgers/${id}`).set(auth)).status).toBe(400);

    const renamed = await request(app).put(`${A}/ledgers/${id}`).set(auth).send({ name: "Razorpay Settlement A/c" });
    expect(renamed.status).toBe(200);
    expect((await Ledger.findById(id)).systemKey).toBe("razorpay");
  });

  it("will not delete a ledger that has vouchers, but will deactivate it", async () => {
    const auth = await adminAuth();
    const bank = (await request(app).get(`${A}/groups`).set(auth)).body.groups.find((g) => g.name === "Bank Accounts");
    const hdfc = (await request(app).post(`${A}/ledgers`).set(auth).send({ name: "HDFC Current", group: bank._id })).body.ledger;
    const capital = await ledgerIdByName(auth, "Proprietor's Capital A/c");

    const v = await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Receipt",
      date: "2026-05-01",
      entries: [{ ledger: hdfc._id, side: "Dr", amount: 100 }, { ledger: capital, side: "Cr", amount: 100 }],
    });
    expect(v.status).toBe(201);

    expect((await request(app).delete(`${A}/ledgers/${hdfc._id}`).set(auth)).status).toBe(400);
    expect((await request(app).put(`${A}/ledgers/${hdfc._id}`).set(auth).send({ isActive: false })).status).toBe(200);

    const blocked = await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Receipt",
      date: "2026-05-02",
      entries: [{ ledger: hdfc._id, side: "Dr", amount: 1 }, { ledger: capital, side: "Cr", amount: 1 }],
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/inactive/i);
  });
});

describe("accounts: vouchers", () => {
  it("creates a balanced voucher with a type/financial-year number series", async () => {
    const auth = await adminAuth();

    const first = await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth));
    expect(first.status).toBe(201);
    expect(first.body.voucher.number).toBe("PAY/2026-27/0001");
    expect(first.body.voucher.total).toBe(2500);
    expect(first.body.voucher.entries.map((e) => e.ledger.name)).toEqual(["Software Subscriptions", "Proprietor's Capital A/c"]);

    const second = await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { date: "2027-03-31" }));
    expect(second.body.voucher.number).toBe("PAY/2026-27/0002");

    const nextYear = await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { date: "2027-04-01" }));
    expect(nextYear.body.voucher.number).toBe("PAY/2027-28/0001");

    const journal = await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { type: "Journal" }));
    expect(journal.body.voucher.number).toBe("JRN/2026-27/0001");
  });

  it("numbers concurrent vouchers uniquely with no gaps or errors", async () => {
    const auth = await adminAuth();
    const body = await paymentBody(auth);

    const results = await Promise.all(Array.from({ length: 10 }, () => request(app).post(`${A}/vouchers`).set(auth).send(body)));
    expect(results.every((r) => r.status === 201)).toBe(true);

    const numbers = results.map((r) => r.body.voucher.number).sort();
    expect(new Set(numbers).size).toBe(10);
    expect(numbers[0]).toBe("PAY/2026-27/0001");
    expect(numbers[9]).toBe("PAY/2026-27/0010");
  });

  it("balances exactly in paise (0.1 + 0.2 = 0.3) and rejects unbalanced vouchers", async () => {
    const auth = await adminAuth();
    const [software, capital, cash] = await Promise.all(["Software Subscriptions", "Proprietor's Capital A/c", "Cash"].map((n) => ledgerIdByName(auth, n)));

    const ok = await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Journal",
      date: "2026-06-01",
      entries: [
        { ledger: software, side: "Dr", amount: 0.3 },
        { ledger: capital, side: "Cr", amount: 0.1 },
        { ledger: cash, side: "Cr", amount: 0.2 },
      ],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.voucher.entries.map((e) => e.amount)).toEqual([0.3, 0.1, 0.2]);

    const off = await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Journal",
      date: "2026-06-01",
      entries: [{ ledger: software, side: "Dr", amount: 100 }, { ledger: capital, side: "Cr", amount: 99.99 }],
    });
    expect(off.status).toBe(400);
    expect(off.body.message).toMatch(/must equal/i);
    expect(await Voucher.countDocuments({})).toBe(1);
  });

  it("rejects invalid vouchers and stores nothing", async () => {
    const auth = await adminAuth();
    const base = await paymentBody(auth);
    const [l1, l2] = base.entries.map((e) => e.ledger);
    const line = (ledger, side, amount) => ({ ledger, side, amount });

    const bad = [
      { ...base, type: "Bogus" },
      { ...base, type: undefined },
      { ...base, date: "2026-02-31" },
      { ...base, date: "01-10-2026" },
      { ...base, date: "2026-03-31" }, // before books start (1 Apr 2026)
      { ...base, date: "2099-01-01" },
      { ...base, narration: "x".repeat(501) },
      { ...base, narration: { $gt: "" } },
      { ...base, entries: [line(l1, "Dr", 10)] },
      { ...base, entries: "nope" },
      { ...base, entries: Array.from({ length: 51 }, (_, i) => line(i % 2 ? l1 : l2, i % 2 ? "Dr" : "Cr", 1)) },
      { ...base, entries: [line(l1, "Dr", 0), line(l2, "Cr", 0)] },
      { ...base, entries: [line(l1, "Dr", -5), line(l2, "Cr", -5)] },
      { ...base, entries: [line(l1, "Dr", "10"), line(l2, "Cr", "10")] },
      { ...base, entries: [line(l1, "Dr", 1.234), line(l2, "Cr", 1.234)] },
      { ...base, entries: [line(l1, "Debit", 10), line(l2, "Cr", 10)] },
      { ...base, entries: [line("nope", "Dr", 10), line(l2, "Cr", 10)] },
      { ...base, entries: [line({ $ne: null }, "Dr", 10), line(l2, "Cr", 10)] },
      { ...base, entries: [line("64b000000000000000000000", "Dr", 10), line(l2, "Cr", 10)] },
    ];

    for (const body of bad) {
      const res = await request(app).post(`${A}/vouchers`).set(auth).send(body);
      expect(res.status, JSON.stringify(body).slice(0, 120)).toBe(400);
    }
    expect(await Voucher.countDocuments({})).toBe(0);
  });

  it("enforces the period lock for create, edit and void", async () => {
    const auth = await adminAuth();
    const created = await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { date: "2026-05-10" }));
    const id = created.body.voucher._id;

    const lock = await request(app).put(`${A}/settings`).set(auth).send({ lockedThrough: "2026-05-31" });
    expect(lock.status).toBe(200);
    expect(lock.body.settings.lockedThrough).toBe("2026-05-31");

    expect((await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { date: "2026-05-31" }))).status).toBe(400);
    expect((await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { date: "2026-06-01" }))).status).toBe(201);
    expect((await request(app).put(`${A}/vouchers/${id}`).set(auth).send(await paymentBody(auth, { date: "2026-05-11" }))).status).toBe(400);
    expect((await request(app).delete(`${A}/vouchers/${id}`).set(auth)).status).toBe(400);

    await request(app).put(`${A}/settings`).set(auth).send({ lockedThrough: null });
    expect((await request(app).delete(`${A}/vouchers/${id}`).set(auth)).status).toBe(200);
  });

  it("edits a hand-entered voucher but keeps its number, type and financial year", async () => {
    const auth = await adminAuth();
    const created = await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth));
    const id = created.body.voucher._id;
    const [dr, cr] = created.body.voucher.entries.map((e) => e.ledger._id);

    const edited = await request(app).put(`${A}/vouchers/${id}`).set(auth).send({
      type: "Sales", // ignored: the type never changes
      date: "2026-10-06",
      narration: "Corrected",
      entries: [{ ledger: dr, side: "Dr", amount: 2412.5 }, { ledger: cr, side: "Cr", amount: 2412.5 }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.voucher.number).toBe("PAY/2026-27/0001");
    expect(edited.body.voucher.type).toBe("Payment");
    expect(edited.body.voucher.total).toBe(2412.5);
    expect(edited.body.voucher.narration).toBe("Corrected");

    const nextFy = await request(app).put(`${A}/vouchers/${id}`).set(auth).send(await paymentBody(auth, { date: "2027-04-01" }));
    expect(nextFy.status).toBe(400);

    const unbalanced = await request(app).put(`${A}/vouchers/${id}`).set(auth).send({
      date: "2026-10-06",
      entries: [{ ledger: dr, side: "Dr", amount: 10 }, { ledger: cr, side: "Cr", amount: 9 }],
    });
    expect(unbalanced.status).toBe(400);
    expect((await Voucher.findById(id)).totalPaise).toBe(241250);

    const log = await AccountingLog.findOne({ action: "update", entity: "voucher", entityId: id });
    expect(log.details.previous.totalPaise).toBe(250000);
  });

  it("voids instead of deleting: gone from lists and balances, kept for audit", async () => {
    const auth = await adminAuth();
    const created = await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth));
    const id = created.body.voucher._id;

    expect((await request(app).get(`${A}/ledgers`).set(auth)).body.ledgers.find((l) => l.name === "Software Subscriptions").closing).toBe(2500);

    expect((await request(app).delete(`${A}/vouchers/${id}`).set(auth)).status).toBe(200);

    expect((await request(app).get(`${A}/vouchers`).set(auth)).body.vouchers).toHaveLength(0);
    expect((await request(app).get(`${A}/vouchers/${id}`).set(auth)).status).toBe(404);
    expect((await request(app).put(`${A}/vouchers/${id}`).set(auth).send(await paymentBody(auth))).status).toBe(404);
    expect((await request(app).delete(`${A}/vouchers/${id}`).set(auth)).status).toBe(404);
    expect((await request(app).get(`${A}/ledgers`).set(auth)).body.ledgers.find((l) => l.name === "Software Subscriptions").closing).toBe(0);
    expect((await Voucher.findById(id)).voided).toBe(true);
  });

  it("lists with filters and rejects malformed or injected query params", async () => {
    const auth = await adminAuth();
    const cash = await ledgerIdByName(auth, "Cash");
    await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { date: "2026-05-05" }));
    await request(app).post(`${A}/vouchers`).set(auth).send(await paymentBody(auth, { date: "2026-06-05", type: "Journal" }));
    await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Receipt",
      date: "2026-07-05",
      entries: [{ ledger: cash, side: "Dr", amount: 50 }, { ledger: await ledgerIdByName(auth, "Proprietor's Capital A/c"), side: "Cr", amount: 50 }],
    });

    const list = async (qs) => (await request(app).get(`${A}/vouchers?${qs}`).set(auth));
    expect((await list("")).body.vouchers.map((v) => v.date)).toEqual(["2026-07-05", "2026-06-05", "2026-05-05"]);
    expect((await list("type=Journal")).body.vouchers).toHaveLength(1);
    expect((await list("from=2026-06-01&to=2026-06-30")).body.vouchers).toHaveLength(1);
    expect((await list("from=2026-06-05&to=2026-06-05")).body.vouchers).toHaveLength(1);
    expect((await list(`ledger=${cash}`)).body.vouchers).toHaveLength(1);

    for (const qs of ["type=Bogus", "from=2026-02-31", "to=garbage", "ledger=nope"]) {
      expect((await list(qs)).status, qs).toBe(400);
    }
    for (const qs of ["type[$ne]=Journal", "ledger[$ne]=x", "from[$gt]=2020-01-01"]) {
      const res = await list(qs);
      expect([200, 400], qs).toContain(res.status);
      if (res.status === 200) expect(res.body.vouchers, qs).toHaveLength(3);
    }
  });
});

describe("accounts: balances", () => {
  it("combines opening balance and vouchers, respects asOf, and puts debits/credits on the right side", async () => {
    const auth = await adminAuth();
    const bank = (await request(app).get(`${A}/groups`).set(auth)).body.groups.find((g) => g.name === "Bank Accounts");
    const sbi = await ledgerIdByName(auth, "SBI A/C");
    const capital = await ledgerIdByName(auth, "Proprietor's Capital A/c");
    const software = await ledgerIdByName(auth, "Software Subscriptions");
    expect(bank).toBeTruthy();

    await request(app).put(`${A}/ledgers/${sbi}`).set(auth).send({ openingBalance: 1000, openingSide: "Dr" });

    await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Receipt", date: "2026-05-01",
      entries: [{ ledger: sbi, side: "Dr", amount: 500 }, { ledger: capital, side: "Cr", amount: 500 }],
    });
    await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Payment", date: "2026-08-01",
      entries: [{ ledger: software, side: "Dr", amount: 2500 }, { ledger: sbi, side: "Cr", amount: 2500 }],
    });

    const get = async (qs = "") => (await request(app).get(`${A}/ledgers${qs}`).set(auth)).body.ledgers;
    const byName = (list, n) => list.find((l) => l.name === n);

    const now = await get();
    expect(byName(now, "SBI A/C")).toMatchObject({ opening: 1000, debits: 500, credits: 2500, closing: 1000, closingSide: "Cr" });
    expect(byName(now, "Software Subscriptions")).toMatchObject({ debits: 2500, closing: 2500, closingSide: "Dr" });
    expect(byName(now, "Proprietor's Capital A/c")).toMatchObject({ credits: 500, closing: 500, closingSide: "Cr" });

    const june = await get("?asOf=2026-06-30");
    expect(byName(june, "SBI A/C")).toMatchObject({ debits: 500, credits: 0, closing: 1500, closingSide: "Dr" });
    expect(byName(june, "Software Subscriptions").closing).toBe(0);

    expect((await request(app).get(`${A}/ledgers?asOf=garbage`).set(auth)).status).toBe(400);
  });
});

describe("accounts: automatic-posting support", () => {
  it("allows one live voucher per source document and reports a duplicate cleanly", async () => {
    const auth = await adminAuth();
    const body = await paymentBody(auth);

    const first = await createVoucher(body, { source: { kind: "order", id: "abc123" } });
    expect(first.voucher.number).toBe("PAY/2026-27/0001");

    const second = await createVoucher(body, { source: { kind: "order", id: "abc123" } });
    expect(second.duplicate).toBe(true);
    expect(second.status).toBe(409);
    expect(await Voucher.countDocuments({})).toBe(1);

    // After the first is voided, the same source may post again.
    await Voucher.updateOne({ _id: first.voucher._id }, { voided: true });
    const third = await createVoucher(body, { source: { kind: "order", id: "abc123" } });
    expect(third.voucher).toBeTruthy();
  });

  it("does not let a person edit an automatically created voucher", async () => {
    const auth = await adminAuth();
    const body = await paymentBody(auth);
    const auto = await createVoucher(body, { source: { kind: "order", id: "zzz" } });

    const res = await request(app).put(`${A}/vouchers/${auto.voucher._id}`).set(auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/automatically/i);
  });

  it("refuses to store an unbalanced voucher even if validation is bypassed", async () => {
    const auth = await adminAuth();
    const [a, b] = [await ledgerIdByName(auth, "Cash"), await ledgerIdByName(auth, "Proprietor's Capital A/c")];

    await expect(
      Voucher.create({
        type: "Journal", number: "JRN/2026-27/9999", fy: "2026-27", seq: 9999, date: new Date(), totalPaise: 1000,
        entries: [{ ledger: a, side: "Dr", amountPaise: 1000 }, { ledger: b, side: "Cr", amountPaise: 900 }],
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it("converts rupees to paise exactly", () => {
    expect(paiseFromRupees(0.1 + 0.2)).toBe(30);
    expect(paiseFromRupees(19.99)).toBe(1999);
    expect(paiseFromRupees(1.005)).toBeNull(); // 3 decimals
    expect(paiseFromRupees(-1)).toBeNull();
    expect(paiseFromRupees("5")).toBeNull();
    expect(paiseFromRupees(NaN)).toBeNull();
  });
});
