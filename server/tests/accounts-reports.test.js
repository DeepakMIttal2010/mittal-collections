import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import OrderCost from "../models/OrderCost.js";
import Expense from "../models/Expense.js";
import Role from "../models/Role.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { reconcileAll } from "../utils/accountingPosting.js";

const A = "/api/admin/accounts";

const adminAuth = async () => {
  const admin = await createUser({ role: "admin" });
  return { Authorization: `Bearer ${signToken(admin)}` };
};

const shippedOn = (date) => [
  { status: "Pending", changedAt: new Date(`${date}T05:00:00+05:30`) },
  { status: "Shipped", changedAt: new Date(`${date}T14:00:00+05:30`) },
];

// The real first order: items 335 + delivery 19 - coupon 34 = 320, cost 175 + 18, courier 84.
const realOrder = async () => {
  const user = await createUser();
  const product = await createProduct({ price: 335, purchasePrice: 175, miscExpenses: 18, stock: 5 });
  const order = await createOrder({
    user,
    products: [product],
    overrides: {
      orderStatus: "Shipped",
      paymentMethod: "Razorpay",
      isPaid: true,
      totalPrice: 320,
      deliveryFee: 19,
      discountAmount: 34,
      statusHistory: shippedOn("2026-08-10"),
      orderItems: [{ product: product._id, name: product.name, image: product.image, price: 335, quantity: 1, size: "" }],
    },
  });
  await OrderCost.create({
    order: order._id,
    items: [{ product: product._id, size: "", quantity: 1, unitPurchasePrice: 175, unitMiscExpenses: 18 }],
    courierCharge: 84,
  });
  return order;
};

const get = async (auth, path) => request(app).get(`${A}${path}`).set(auth);
const rowOf = (rows, name) => rows.find((x) => x.name === name);
const ledgerId = async (auth, name) => (await get(auth, "/ledgers")).body.ledgers.find((l) => l.name === name)._id;

const setup = async () => {
  const auth = await adminAuth();
  await realOrder();
  await reconcileAll({ stock: false });
  return auth;
};

describe("reports: access control and input checks", () => {
  const paths = ["/reports/trial-balance", "/reports/balance-sheet", "/reports/trading-pl", "/reports/group-summary", "/reports/day-book"];

  it("rejects anonymous, customer, and staff without the accounts permission", async () => {
    const customer = await createUser();
    const role = await Role.create({ name: "Orders only", permissions: ["orders"] });
    const staff = await createUser({ role: "admin", adminRole: role._id });

    for (const path of paths) {
      expect((await request(app).get(`${A}${path}`)).status, path).toBe(401);
      expect((await request(app).get(`${A}${path}`).set("Authorization", `Bearer ${signToken(customer)}`)).status, path).toBe(403);
      expect((await request(app).get(`${A}${path}`).set("Authorization", `Bearer ${signToken(staff)}`)).status, path).toBe(403);
    }
  });

  it("validates dates, ids and types, and never 500s on injected params", async () => {
    const auth = await adminAuth();
    const bad = [
      "/reports/trial-balance?asOf=2026-02-31",
      "/reports/balance-sheet?asOf=garbage",
      "/reports/trading-pl?from=2026-02-31",
      "/reports/trading-pl?to=nope",
      "/reports/trading-pl?from=2026-10-10&to=2026-10-01",
      "/reports/group-summary?group=nope",
      "/reports/day-book?type=Bogus",
      "/reports/day-book?from=garbage",
      "/reports/ledger/not-an-id",
    ];
    for (const path of bad) expect((await get(auth, path)).status, path).toBe(400);

    expect((await get(auth, "/reports/ledger/64b000000000000000000000")).status).toBe(404);
    expect((await get(auth, "/reports/group-summary?group=64b000000000000000000000")).status).toBe(404);

    for (const path of ["/reports/day-book?type[$ne]=Journal", "/reports/trading-pl?from[$gt]=2020-01-01", "/reports/group-summary?group[$ne]=x"]) {
      const res = await get(auth, path);
      expect([200, 400], path).toContain(res.status);
    }
  });
});

describe("reports: the real Rs 320 order", () => {
  it("trial balance balances and lists each ledger on its own side", async () => {
    const auth = await setup();
    const { report } = (await get(auth, "/reports/trial-balance")).body;

    expect(report.balanced).toBe(true);
    expect(report.difference).toBe(0);
    expect(report.totalDebit).toBe(report.totalCredit);
    expect(report.totalDebit).toBe(354 + 193 + 84); // razorpay 320 + discount 34 + cogs 193 + courier 84

    expect(rowOf(report.rows, "Razorpay A/c")).toMatchObject({ debit: 320, credit: 0 });
    expect(rowOf(report.rows, "Sales – Online")).toMatchObject({ debit: 0, credit: 335 });
    expect(rowOf(report.rows, "Stock in Hand")).toMatchObject({ debit: 0, credit: 193 });
    expect(rowOf(report.rows, "Cash")).toBeUndefined(); // zero ledgers are hidden
  });

  it("trading account: gross profit 77; profit & loss: net profit exactly 43", async () => {
    const auth = await setup();
    const { report } = (await get(auth, "/reports/trading-pl")).body;

    expect(report.grossProfit).toBe(77);
    expect(report.netProfit).toBe(43);

    // Trading account: Dr = COGS 193 + courier 84 (+ gross profit c/d 77); Cr = sales 335 + delivery 19.
    expect(rowOf(report.trading.left, "Direct Expenses").amount).toBe(277);
    expect(rowOf(report.trading.left, "Gross Profit c/d").amount).toBe(77);
    expect(rowOf(report.trading.right, "Sales Accounts").amount).toBe(335);
    expect(rowOf(report.trading.right, "Direct Incomes").amount).toBe(19);
    expect(report.trading.total).toBe(354);

    // P&L: Dr = discount allowed 34 + net profit 43; Cr = gross profit b/f 77.
    expect(rowOf(report.profitLoss.left, "Discount Allowed").amount).toBe(34);
    expect(rowOf(report.profitLoss.left, "Net Profit").amount).toBe(43);
    expect(rowOf(report.profitLoss.right, "Gross Profit b/f").amount).toBe(77);
    expect(report.profitLoss.total).toBe(77);
  });

  it("shows a net loss on the other side once expenses exceed the gross profit", async () => {
    const auth = await setup();
    await Expense.create({ date: new Date("2026-09-05T12:00:00+05:30"), category: "Software & Subscriptions", amount: 500 });
    await reconcileAll({ stock: false });

    const { report } = (await get(auth, "/reports/trading-pl")).body;
    expect(report.netProfit).toBe(-457);
    expect(rowOf(report.profitLoss.right, "Net Loss").amount).toBe(457);
    expect(rowOf(report.profitLoss.left, "Net Profit")).toBeUndefined();
    // both sides still add up to the same total
    const sum = (rows) => rows.filter((x) => x.kind === "group" && x.depth === 0 || x.kind === "balance").reduce((s, x) => s + x.amount, 0);
    expect(Math.round(sum(report.profitLoss.left) * 100)).toBe(Math.round(sum(report.profitLoss.right) * 100));
  });

  it("respects the date range", async () => {
    const auth = await setup();

    const september = (await get(auth, "/reports/trading-pl?from=2026-09-01&to=2026-09-30")).body.report;
    expect(september.grossProfit).toBe(0);
    expect(september.netProfit).toBe(0);

    const august = (await get(auth, "/reports/trading-pl?from=2026-08-01&to=2026-08-31")).body.report;
    expect(august.netProfit).toBe(43);

    const exactDay = (await get(auth, "/reports/trading-pl?from=2026-08-10&to=2026-08-10")).body.report;
    expect(exactDay.netProfit).toBe(43);

    // before the books start is clamped, not an error
    const early = await get(auth, "/reports/trading-pl?from=2020-01-01&to=2026-12-31");
    expect(early.status).toBe(200);
    expect(early.body.report.from).toBe("2026-04-01");
  });

  it("balance sheet: assets 127 = liabilities 127 (capital 84 + profit 43)", async () => {
    const auth = await setup();
    const { report } = (await get(auth, "/reports/balance-sheet")).body;

    expect(report.balanced).toBe(true);
    expect(report.difference).toBe(0);
    expect(report.assets.total).toBe(127);
    expect(report.liabilities.total).toBe(127);

    expect(rowOf(report.assets.rows, "Razorpay A/c").amount).toBe(320);
    expect(rowOf(report.assets.rows, "Stock in Hand").amount).toBe(-193);
    expect(rowOf(report.liabilities.rows, "Proprietor's Capital A/c").amount).toBe(84);
    expect(rowOf(report.liabilities.rows, "Profit & Loss A/c (profit)").amount).toBe(43);
    expect(report.netProfit).toBe(43);
  });

  it("a loss moves to the assets side and the sheet still balances", async () => {
    const auth = await setup();
    await Expense.create({ date: new Date("2026-09-05T12:00:00+05:30"), category: "Marketing & Ads", amount: 500 });
    await reconcileAll({ stock: false });

    const { report } = (await get(auth, "/reports/balance-sheet")).body;
    expect(rowOf(report.assets.rows, "Profit & Loss A/c (loss)").amount).toBe(457);
    expect(report.balanced).toBe(true);
    expect(report.assets.total).toBe(report.liabilities.total);
  });

  it("as-on dates before the sale show nothing, after it show everything", async () => {
    const auth = await setup();
    const before = (await get(auth, "/reports/balance-sheet?asOf=2026-08-09")).body.report;
    expect(before.assets.total).toBe(0);
    expect(before.balanced).toBe(true);

    const after = (await get(auth, "/reports/balance-sheet?asOf=2026-08-10")).body.report;
    expect(after.assets.total).toBe(127);
  });

  it("opening balances are included, and an unmatched opening shows up as a difference", async () => {
    const auth = await setup();
    const sbi = await ledgerId(auth, "SBI A/C");
    const capital = await ledgerId(auth, "Proprietor's Capital A/c");

    await request(app).put(`${A}/ledgers/${sbi}`).set(auth).send({ openingBalance: 1000, openingSide: "Dr" });
    const unmatched = (await get(auth, "/reports/balance-sheet")).body.report;
    expect(unmatched.balanced).toBe(false);
    expect(unmatched.difference).toBe(1000);
    expect((await get(auth, "/reports/trial-balance")).body.report.difference).toBe(1000);

    await request(app).put(`${A}/ledgers/${capital}`).set(auth).send({ openingBalance: 1000, openingSide: "Cr" });
    const matched = (await get(auth, "/reports/balance-sheet")).body.report;
    expect(matched.balanced).toBe(true);
    expect(rowOf(matched.assets.rows, "SBI A/C").amount).toBe(1000);
    expect(matched.assets.total).toBe(1127);
  });
});

describe("reports: group summary, ledger statement, day book", () => {
  it("shows the primary groups, then drills into a group's ledgers", async () => {
    const auth = await setup();
    const top = (await get(auth, "/reports/group-summary")).body.report;

    expect(top.group).toBeNull();
    expect(rowOf(top.items, "Sales Accounts")).toMatchObject({ kind: "group", credit: 335, debit: 0, closing: 335, closingSide: "Cr" });
    expect(rowOf(top.items, "Direct Expenses")).toMatchObject({ debit: 277, closing: 277, closingSide: "Dr" });

    const groupId = rowOf(top.items, "Sales Accounts").id;
    const drill = (await get(auth, `/reports/group-summary?group=${groupId}`)).body.report;
    expect(drill.group.name).toBe("Sales Accounts");
    expect(drill.breadcrumb.map((b) => b.name)).toEqual(["Sales Accounts"]);
    expect(rowOf(drill.items, "Sales – Online")).toMatchObject({ kind: "ledger", credit: 335, closing: 335, closingSide: "Cr" });
  });

  it("separates opening balance from the period's activity", async () => {
    const auth = await setup();
    const top = (await get(auth, "/reports/group-summary?from=2026-09-01&to=2026-09-30")).body.report;
    expect(rowOf(top.items, "Sales Accounts")).toMatchObject({ opening: 335, openingSide: "Cr", debit: 0, credit: 0, closing: 335 });

    const inRange = (await get(auth, "/reports/group-summary?from=2026-08-01&to=2026-08-31")).body.report;
    expect(rowOf(inRange.items, "Sales Accounts")).toMatchObject({ opening: 0, credit: 335, closing: 335 });
  });

  it("ledger statement: running balance, other-side particulars, opening carried into a later window", async () => {
    const auth = await setup();
    const razorpay = await ledgerId(auth, "Razorpay A/c");
    const sbi = await ledgerId(auth, "SBI A/C");

    const settle = await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Receipt",
      date: "2026-08-20",
      narration: "Razorpay settlement",
      entries: [{ ledger: sbi, side: "Dr", amount: 300 }, { ledger: razorpay, side: "Cr", amount: 300 }],
    });
    expect(settle.status).toBe(201);

    const { report } = (await get(auth, `/reports/ledger/${razorpay}`)).body;
    expect(report.ledger.name).toBe("Razorpay A/c");
    expect(report.opening).toBe(0);
    expect(report.lines).toHaveLength(2);
    expect(report.lines[0]).toMatchObject({ date: "2026-08-10", debit: 320, credit: 0, balance: 320, balanceSide: "Dr", particulars: "(as per details)" });
    expect(report.lines[1]).toMatchObject({ date: "2026-08-20", debit: 0, credit: 300, balance: 20, balanceSide: "Dr", particulars: "SBI A/C", narration: "Razorpay settlement" });
    expect(report.totalDebit).toBe(320);
    expect(report.totalCredit).toBe(300);
    expect(report.closing).toBe(20);
    expect(report.closingSide).toBe("Dr");

    const later = (await get(auth, `/reports/ledger/${razorpay}?from=2026-08-15&to=2026-08-31`)).body.report;
    expect(later.opening).toBe(320);
    expect(later.openingSide).toBe("Dr");
    expect(later.lines).toHaveLength(1);
    expect(later.closing).toBe(20);

    // a voided voucher disappears from the statement
    await request(app).delete(`${A}/vouchers/${settle.body.voucher._id}`).set(auth);
    expect((await get(auth, `/reports/ledger/${razorpay}`)).body.report.lines).toHaveLength(1);
  });

  it("day book lists vouchers by date, filters by type, and flags automatic ones", async () => {
    const auth = await setup();
    const cash = await ledgerId(auth, "Cash");
    const capital = await ledgerId(auth, "Proprietor's Capital A/c");
    await request(app).post(`${A}/vouchers`).set(auth).send({
      type: "Receipt", date: "2026-08-05", entries: [{ ledger: cash, side: "Dr", amount: 50 }, { ledger: capital, side: "Cr", amount: 50 }],
    });

    const { report } = (await get(auth, "/reports/day-book")).body;
    expect(report.count).toBe(4); // receipt + sale + cogs + courier
    expect(report.vouchers.map((v) => v.date)).toEqual(["2026-08-05", "2026-08-10", "2026-08-10", "2026-08-10"]);
    expect(report.vouchers[0]).toMatchObject({ type: "Receipt", automatic: false, amount: 50 });
    expect(report.vouchers[1].automatic).toBe(true);
    expect(report.vouchers[1].entries.length).toBeGreaterThanOrEqual(2);

    const sales = (await get(auth, "/reports/day-book?type=Sales")).body.report;
    expect(sales.count).toBe(1);
    expect(sales.total).toBe(354);

    const none = (await get(auth, "/reports/day-book?from=2026-09-01&to=2026-09-30")).body.report;
    expect(none.count).toBe(0);
  });
});
