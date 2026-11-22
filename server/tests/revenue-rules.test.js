import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import OfflineSale from "../models/OfflineSale.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { getSystemLedgerMap } from "../utils/accounting.js";
import { getLedgerActivity } from "../utils/accountingReports.js";
import { reconcileAll } from "../utils/accountingPosting.js";
import { parseIstDate } from "../utils/recurringExpenses.js";

// PR-5 (admin audit RP-01): Dashboard and Reports revenue follow the same
// rule the books already use (accountingPosting.js):
//   - an online order counts once it is Shipped/Delivered and not
//     soft-deleted, on its SHIP date (first Shipped/Delivered history entry),
//     whatever the payment method or isPaid flag (owner D3);
//   - a refund is taken off on the date it was refunded (owner D1), only
//     while its order still counts as sold;
//   - delivery fee + COD charge stay in the total and are also reported on
//     their own line (owner D2);
//   - POS sales count on createdAt unless voided;
//   - product/category breakdowns are item price x quantity before
//     discounts, on the same order set (owner D5).

const ist = (day, time = "12:00:00") => new Date(`${day}T${time}+05:30`);

const history = (...steps) => steps.map(([status, day, time]) => ({ status, changedAt: ist(day, time) }));

const adminToken = async () => signToken(await createUser({ role: "admin" }));

const report = async (token, startDate, endDate) => {
  const res = await request(app)
    .get(`/api/admin/reports?startDate=${startDate}&endDate=${endDate}`)
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body;
};

const dashboard = async (token) => {
  const res = await request(app).get("/api/admin/dashboard").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.data;
};

// One order line of `price`, created on `createdDay` (backdated on the raw
// collection so mongoose timestamps don't overwrite it).
const order = async ({ price, createdDay, ...overrides }) => {
  const user = await createUser();
  const product = await createProduct({ price, stock: 5 });
  const doc = await createOrder({
    user,
    products: [product],
    overrides: {
      totalPrice: price,
      orderItems: [{ product: product._id, name: product.name, image: product.image, price, quantity: 1, size: "" }],
      ...overrides,
    },
  });
  await Order.collection.updateOne({ _id: doc._id }, { $set: { createdAt: ist(createdDay, "10:00:00") } });
  return { order: await Order.findById(doc._id), product, user };
};

const pos = async ({ day, subtotal, discount = 0, ...overrides }) => {
  const seller = await createUser({ role: "admin" });
  const product = await createProduct({ price: subtotal });
  const doc = await OfflineSale.create({
    items: [{ product: product._id, productName: product.name, quantity: 1, unitPrice: subtotal, originalPrice: subtotal, subtotal }],
    discountAmount: discount,
    totalAmount: subtotal - discount,
    paymentMethod: "Cash",
    soldBy: seller._id,
    ...overrides,
  });
  await OfflineSale.collection.updateOne({ _id: doc._id }, { $set: { createdAt: ist(day, "11:00:00") } });
  return doc;
};

// A refunded item-level return, the way returnController leaves it: the
// return carries refundedAt and the order's refundedAmount grows by the
// same value.
const refund = async ({ order: o, product, user, day, amount }) => {
  await ReturnRequest.create({
    order: o._id,
    user: user._id,
    product: product._id,
    productName: product.name,
    quantity: 1,
    reason: "Defect",
    status: "Refunded",
    stockRestored: true,
    refundedAt: ist(day, "15:00:00"),
  });
  await Order.updateOne({ _id: o._id }, { $inc: { refundedAmount: amount } });
};

const rupeesToPaise = (r) => Math.round(r * 100);

// ------------------------------------------------------------------ rules
describe("PR-5: which online orders count as revenue", () => {
  it("Pending and Processing orders (COD or unpaid Razorpay) count as zero", async () => {
    const token = await adminToken();
    await order({ price: 800, createdDay: "2026-09-06", orderStatus: "Pending", paymentMethod: "COD", statusHistory: history(["Pending", "2026-09-06"]) });
    await order({ price: 700, createdDay: "2026-09-06", orderStatus: "Pending", paymentMethod: "Razorpay", isPaid: false, statusHistory: history(["Pending", "2026-09-06"]) });
    await order({ price: 600, createdDay: "2026-09-06", orderStatus: "Processing", paymentMethod: "Razorpay", isPaid: true, statusHistory: history(["Pending", "2026-09-06"], ["Processing", "2026-09-07"]) });

    const body = await report(token, "2026-09-01", "2026-09-30");
    expect(body.summary.totalRevenue).toBe(0);
    expect(body.summary.totalOrders).toBe(3); // orders PLACED stays a volume metric
  });

  it("a shipped COD order counts (no payment-method filter)", async () => {
    const token = await adminToken();
    await order({ price: 900, createdDay: "2026-09-02", orderStatus: "Shipped", paymentMethod: "COD", statusHistory: history(["Pending", "2026-09-02"], ["Shipped", "2026-09-04"]) });

    expect((await report(token, "2026-09-01", "2026-09-30")).summary.totalRevenue).toBe(900);
  });

  it("D3: an unpaid Razorpay order that was Shipped counts, same as the books", async () => {
    const token = await adminToken();
    await order({ price: 300, createdDay: "2026-09-10", orderStatus: "Shipped", paymentMethod: "Razorpay", isPaid: false, statusHistory: history(["Pending", "2026-09-10"], ["Shipped", "2026-09-12"]) });

    expect((await report(token, "2026-09-01", "2026-09-30")).summary.totalRevenue).toBe(300);
  });

  it("a soft-deleted (isActive false) shipped order is excluded", async () => {
    const token = await adminToken();
    await order({ price: 400, createdDay: "2026-09-08", orderStatus: "Shipped", isActive: false, statusHistory: history(["Pending", "2026-09-08"], ["Shipped", "2026-09-10"]) });

    expect((await report(token, "2026-09-01", "2026-09-30")).summary.totalRevenue).toBe(0);
  });

  it("an order cancelled after shipping is excluded entirely", async () => {
    const token = await adminToken();
    await order({ price: 600, createdDay: "2026-09-05", orderStatus: "Cancelled", statusHistory: history(["Pending", "2026-09-05"], ["Shipped", "2026-09-07"], ["Cancelled", "2026-09-09"]) });

    expect((await report(token, "2026-09-01", "2026-09-30")).summary.totalRevenue).toBe(0);
  });
});

describe("PR-5: revenue is dated by SHIP date (IST)", () => {
  it("created in one period, shipped in the next -> counts only in the ship period", async () => {
    const token = await adminToken();
    await order({ price: 1000, createdDay: "2026-08-30", orderStatus: "Delivered", statusHistory: history(["Pending", "2026-08-30"], ["Shipped", "2026-09-03"], ["Delivered", "2026-09-06"]) });

    expect((await report(token, "2026-08-01", "2026-08-31")).summary.totalRevenue).toBe(0);
    expect((await report(token, "2026-09-01", "2026-09-30")).summary.totalRevenue).toBe(1000);
  });

  it("the daily chart puts the sale on its ship day, not its order day", async () => {
    const token = await adminToken();
    await order({ price: 1000, createdDay: "2026-09-01", orderStatus: "Shipped", statusHistory: history(["Pending", "2026-09-01"], ["Shipped", "2026-09-05"]) });

    const { salesOverTime } = await report(token, "2026-09-01", "2026-09-30");
    expect(salesOverTime.find((d) => d._id === "2026-09-01")).toBeUndefined();
    expect(salesOverTime.find((d) => d._id === "2026-09-05")?.revenue).toBe(1000);
  });

  it("shipped at 23:50 IST lands on that IST day, not the next UTC-shifted one", async () => {
    const token = await adminToken();
    await order({ price: 500, createdDay: "2026-09-09", orderStatus: "Shipped", statusHistory: history(["Pending", "2026-09-09"], ["Shipped", "2026-09-10", "23:50:00"]) });

    expect((await report(token, "2026-09-10", "2026-09-10")).summary.totalRevenue).toBe(500);
    expect((await report(token, "2026-09-11", "2026-09-11")).summary.totalRevenue).toBe(0);
  });
});

describe("PR-5 D1: refunds come off in the period they were refunded", () => {
  it("ship period keeps the full sale; refund period carries the minus", async () => {
    const token = await adminToken();
    const o = await order({ price: 1000, createdDay: "2026-09-01", orderStatus: "Delivered", statusHistory: history(["Pending", "2026-09-01"], ["Shipped", "2026-09-05"], ["Delivered", "2026-09-07"]) });
    await refund({ ...o, day: "2026-10-03", amount: 1000 });

    const sept = await report(token, "2026-09-01", "2026-09-30");
    const oct = await report(token, "2026-10-01", "2026-10-31");
    expect(sept.summary.totalRevenue).toBe(1000);
    expect(oct.summary.totalRevenue).toBe(-1000);
    expect(oct.summary.revenueBreakdown.refunds).toBe(1000);
  });

  it("a refund on an order that no longer counts as sold is not taken off again", async () => {
    const token = await adminToken();
    const o = await order({ price: 600, createdDay: "2026-09-01", orderStatus: "Cancelled", statusHistory: history(["Pending", "2026-09-01"], ["Shipped", "2026-09-03"], ["Cancelled", "2026-09-09"]) });
    await refund({ ...o, day: "2026-09-20", amount: 600 });

    const sept = await report(token, "2026-09-01", "2026-09-30");
    expect(sept.summary.totalRevenue).toBe(0);
    expect(sept.summary.revenueBreakdown.refunds).toBe(0);
  });
});

describe("PR-5 D2/D5: breakdown lines", () => {
  it("D2: delivery fee + COD charge stay in the total and are shown on their own line", async () => {
    const token = await adminToken();
    // items 1000 + delivery 40 + COD 30 - coupon 100 = 970 paid
    await order({ price: 1000, createdDay: "2026-09-01", totalPrice: 970, deliveryFee: 40, codCharge: 30, discountAmount: 100, orderStatus: "Shipped", statusHistory: history(["Pending", "2026-09-01"], ["Shipped", "2026-09-05"]) });

    const { summary } = await report(token, "2026-09-01", "2026-09-30");
    expect(summary.totalRevenue).toBe(970);
    expect(summary.revenueBreakdown.deliveryCodIncome).toBe(70);
  });

  it("D5: top products use item price x qty before discounts, on shipped orders only", async () => {
    const token = await adminToken();
    const shipped = await order({ price: 1000, createdDay: "2026-09-01", totalPrice: 900, discountAmount: 100, orderStatus: "Shipped", statusHistory: history(["Pending", "2026-09-01"], ["Shipped", "2026-09-05"]) });
    const pending = await order({ price: 800, createdDay: "2026-09-01", orderStatus: "Pending", statusHistory: history(["Pending", "2026-09-01"]) });

    const { topProducts, revenueByCategory } = await report(token, "2026-09-01", "2026-09-30");
    expect(topProducts.find((p) => String(p._id) === String(shipped.product._id))?.revenue).toBe(1000);
    expect(topProducts.find((p) => String(p._id) === String(pending.product._id))).toBeUndefined();
    expect(revenueByCategory.reduce((s, c) => s + c.revenue, 0)).toBe(1000);
  });

  it("average order value divides by shipped orders + POS sales in the range", async () => {
    const token = await adminToken();
    await order({ price: 1000, createdDay: "2026-09-01", orderStatus: "Shipped", statusHistory: history(["Pending", "2026-09-01"], ["Shipped", "2026-09-05"]) });
    await order({ price: 800, createdDay: "2026-09-01", orderStatus: "Pending", statusHistory: history(["Pending", "2026-09-01"]) });
    await pos({ day: "2026-09-15", subtotal: 500 });

    const { summary } = await report(token, "2026-09-01", "2026-09-30");
    expect(summary.totalRevenue).toBe(1500);
    expect(summary.avgOrderValue).toBe(750);
  });

  it("voided POS sales are excluded; live POS counts on its sale date", async () => {
    const token = await adminToken();
    await pos({ day: "2026-09-15", subtotal: 600, discount: 50 });
    await pos({ day: "2026-09-16", subtotal: 999, voided: true, voidedAt: ist("2026-09-17") });

    const { summary } = await report(token, "2026-09-01", "2026-09-30");
    expect(summary.posRevenue).toBe(550);
    expect(summary.totalRevenue).toBe(550);
  });
});

// --------------------------------------------- mixed book: reconciliation
// O1 COD shipped 09-05: items 1000 + delivery 40 + COD 30 - coupon 100 = 970
// O2 Razorpay paid, delivered (shipped 09-08): items 500 - points 50 = 450
// O3 Razorpay UNPAID shipped 09-12 (D3): 300
// O4 Pending COD 800, O5 Processing paid 700          -> excluded
// O6 shipped 09-07 then Cancelled 09-09: 600 (+ its refund 09-20) -> excluded
// O7 shipped 09-10 but soft-deleted: 400              -> excluded
// P1 POS 09-15: 600 - 50 = 550; P2 POS 09-16 voided    -> excluded
// R1 refund on O1 on 10-03: 1000 x (1 - 100/1000) = 900
//
// September: online sales 1800, delivery/COD 70, online discounts 150,
//            POS sales 600, POS discount 50, refunds 0 -> 2270
// October:   refunds 900 -> -900
// All-time:  1370 (of which POS 550)
const seedMixedBook = async () => {
  const o1 = await order({ price: 1000, createdDay: "2026-09-01", totalPrice: 970, deliveryFee: 40, codCharge: 30, discountAmount: 100, paymentMethod: "COD", orderStatus: "Shipped", statusHistory: history(["Pending", "2026-09-01"], ["Shipped", "2026-09-05"]) });
  await order({ price: 500, createdDay: "2026-09-02", totalPrice: 450, pointsDiscount: 50, paymentMethod: "Razorpay", isPaid: true, orderStatus: "Delivered", statusHistory: history(["Pending", "2026-09-02"], ["Shipped", "2026-09-08"], ["Delivered", "2026-09-11"]) });
  await order({ price: 300, createdDay: "2026-09-03", paymentMethod: "Razorpay", isPaid: false, orderStatus: "Shipped", statusHistory: history(["Pending", "2026-09-03"], ["Shipped", "2026-09-12"]) });
  await order({ price: 800, createdDay: "2026-09-06", paymentMethod: "COD", orderStatus: "Pending", statusHistory: history(["Pending", "2026-09-06"]) });
  await order({ price: 700, createdDay: "2026-09-06", paymentMethod: "Razorpay", isPaid: true, orderStatus: "Processing", statusHistory: history(["Pending", "2026-09-06"], ["Processing", "2026-09-07"]) });
  const o6 = await order({ price: 600, createdDay: "2026-09-04", orderStatus: "Cancelled", statusHistory: history(["Pending", "2026-09-04"], ["Shipped", "2026-09-07"], ["Cancelled", "2026-09-09"]) });
  await order({ price: 400, createdDay: "2026-09-08", orderStatus: "Shipped", isActive: false, statusHistory: history(["Pending", "2026-09-08"], ["Shipped", "2026-09-10"]) });
  await pos({ day: "2026-09-15", subtotal: 600, discount: 50 });
  await pos({ day: "2026-09-16", subtotal: 999, voided: true, voidedAt: ist("2026-09-17") });
  await refund({ ...o1, day: "2026-10-03", amount: 900 });
  await refund({ ...o6, day: "2026-09-20", amount: 600 });
};

// Each revenue ledger's activity (paise) in [from, to] from the real books.
const ledgerComponents = async (from, to) => {
  const map = await getSystemLedgerMap();
  const { rows } = await getLedgerActivity(parseIstDate(from), parseIstDate(to));
  const row = (key) => rows.find((r) => String(r.ledger._id) === String(map.get(key))) || { dr: 0, cr: 0 };
  return {
    salesOnline: row("sales-online").cr - row("sales-online").dr,
    salesPos: row("sales-pos").cr - row("sales-pos").dr,
    deliveryIncome: row("delivery-income").cr - row("delivery-income").dr,
    discount: row("discount").dr - row("discount").cr,
    salesReturns: row("sales-returns").dr - row("sales-returns").cr,
  };
};

const expectReconciled = (summary, books) => {
  const b = summary.revenueBreakdown;
  expect(rupeesToPaise(b.onlineSales)).toBe(books.salesOnline);
  expect(rupeesToPaise(b.posSales)).toBe(books.salesPos);
  expect(rupeesToPaise(b.deliveryCodIncome)).toBe(books.deliveryIncome);
  expect(rupeesToPaise(b.onlineDiscounts + b.posDiscounts)).toBe(books.discount);
  expect(rupeesToPaise(b.refunds)).toBe(books.salesReturns);
  expect(rupeesToPaise(summary.totalRevenue)).toBe(
    books.salesOnline + books.salesPos + books.deliveryIncome - books.discount - books.salesReturns,
  );
};

describe("PR-5: Reports reconcile with Accounts, component by component", () => {
  it("September (ship + POS period): every component matches the ledgers", async () => {
    const token = await adminToken();
    await seedMixedBook();
    await reconcileAll({ stock: false });

    const { summary } = await report(token, "2026-09-01", "2026-09-30");
    const books = await ledgerComponents("2026-09-01", "2026-09-30");

    expect(books).toEqual({ salesOnline: 180000, salesPos: 60000, deliveryIncome: 7000, discount: 20000, salesReturns: 0 });
    expectReconciled(summary, books);
    expect(summary.totalRevenue).toBe(2270);
    expect(summary.posRevenue).toBe(550);
    expect(summary.revenueBreakdown).toMatchObject({ onlineSales: 1800, deliveryCodIncome: 70, onlineDiscounts: 150, posSales: 600, posDiscounts: 50, refunds: 0 });
  });

  it("October (refund period): only the refund, dated refundedAt", async () => {
    const token = await adminToken();
    await seedMixedBook();
    await reconcileAll({ stock: false });

    const { summary } = await report(token, "2026-10-01", "2026-10-31");
    const books = await ledgerComponents("2026-10-01", "2026-10-31");

    expect(books).toEqual({ salesOnline: 0, salesPos: 0, deliveryIncome: 0, discount: 0, salesReturns: 90000 });
    expectReconciled(summary, books);
    expect(summary.totalRevenue).toBe(-900);
  });

  it("all-time: Reports and Dashboard agree on the same basis, POS included in both", async () => {
    const token = await adminToken();
    await seedMixedBook();
    await reconcileAll({ stock: false });

    const today = new Date().toISOString().slice(0, 10);
    const { summary } = await report(token, "2026-04-01", today);
    const books = await ledgerComponents("2026-04-01", today);
    expectReconciled(summary, books);
    expect(summary.totalRevenue).toBe(1370);

    const data = await dashboard(token);
    expect(data.totalSales).toBe(summary.totalRevenue);
    expect(data.posSales).toBe(summary.posRevenue);
    expect(data.posSales).toBe(550);
  });
});
