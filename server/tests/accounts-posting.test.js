import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import OrderCost from "../models/OrderCost.js";
import OfflineSale from "../models/OfflineSale.js";
import OfflineSaleCost from "../models/OfflineSaleCost.js";
import ReturnRequest from "../models/ReturnRequest.js";
import Expense from "../models/Expense.js";
import Product from "../models/Product.js";
import Voucher from "../models/Voucher.js";
import Role from "../models/Role.js";
import { AccountingSettings } from "../models/AccountingMisc.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { getLedgerBalances, getSystemLedgerMap, ensureAccountingSeed } from "../utils/accounting.js";
import { reconcileAll, syncExpense, syncOrder } from "../utils/accountingPosting.js";
import { returnedValueFor } from "../utils/returnValue.js";
import { toIstDateString } from "../utils/recurringExpenses.js";

const adminAuth = async () => {
  const admin = await createUser({ role: "admin" });
  return { Authorization: `Bearer ${signToken(admin)}` };
};

// Net balance (paise, Dr positive) of a system ledger.
const net = async (key) => {
  const map = await getSystemLedgerMap();
  const rows = await getLedgerBalances(new Date());
  return rows.find((r) => String(r.ledger._id) === String(map.get(key))).netPaise;
};

const live = (kind) => Voucher.find({ "source.kind": kind, voided: false }).sort({ createdAt: 1 }).lean();

// Sum of every ledger's net must be zero in a balanced set of books.
const trialBalanceIsZero = async () => {
  const rows = await getLedgerBalances(new Date());
  return rows.reduce((s, r) => s + r.netPaise, 0);
};

const shippedOn = (date) => [
  { status: "Pending", changedAt: new Date(`${date}T05:00:00+05:30`) },
  { status: "Shipped", changedAt: new Date(`${date}T14:00:00+05:30`) },
];

// The user's real first order: items 335 + delivery 19 - coupon 34 = 320.
const realOrder = async (overrides = {}) => {
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
      couponCode: "WELCOME10",
      statusHistory: shippedOn("2026-08-10"),
      orderItems: [{ product: product._id, name: product.name, image: product.image, price: 335, quantity: 1, size: "" }],
      ...overrides,
    },
  });
  await OrderCost.create({
    order: order._id,
    items: [{ product: product._id, size: "", quantity: 1, unitPurchasePrice: 175, unitMiscExpenses: 18 }],
    courierCharge: 84,
  });
  return { order, product, user };
};

describe("auto-posting: online orders", () => {
  it("posts the real Rs 320 order and the books show a profit of exactly Rs 43", async () => {
    await realOrder();

    const result = await reconcileAll({ stock: false });
    expect(result.created).toBe(3);

    const [sale] = await live("order-sale");
    expect(sale.type).toBe("Sales");
    expect(toIstDateString(sale.date)).toBe("2026-08-10");
    expect(sale.totalPaise).toBe(35400); // Dr 320 + 34 discount = Cr 335 + 19

    expect(await net("razorpay")).toBe(32000);
    expect(await net("sales-online")).toBe(-33500);
    expect(await net("delivery-income")).toBe(-1900);
    expect(await net("discount")).toBe(3400);
    expect(await net("cogs")).toBe(19300);
    expect(await net("stock")).toBe(-19300);
    expect(await net("courier")).toBe(8400);
    expect(await net("capital")).toBe(-8400);

    const income = -(await net("sales-online")) + -(await net("delivery-income"));
    const costs = (await net("discount")) + (await net("cogs")) + (await net("courier"));
    expect(income - costs).toBe(4300); // Rs 43

    expect(await trialBalanceIsZero()).toBe(0);
  });

  it("is idempotent: running again changes nothing", async () => {
    await realOrder();
    await reconcileAll({ stock: false });
    const before = (await Voucher.find({}).lean()).map((v) => `${v.number}:${v.totalPaise}`).sort();

    const again = await reconcileAll({ stock: false });
    expect(again.created).toBe(0);
    expect(again.updated).toBe(0);
    expect(again.voided).toBe(0);
    expect(again.unchanged).toBe(3);

    expect((await Voucher.find({}).lean()).map((v) => `${v.number}:${v.totalPaise}`).sort()).toEqual(before);
  });

  it("edits a voucher in place (same number) when the order's figures change", async () => {
    const { order } = await realOrder();
    await reconcileAll({ stock: false });
    const [first] = await live("order-sale");

    await Order.updateOne({ _id: order._id }, { deliveryFee: 29, totalPrice: 330 });
    const result = await reconcileAll({ stock: false });

    expect(result.updated).toBe(1);
    const [after] = await live("order-sale");
    expect(after.number).toBe(first.number);
    expect(after._id.toString()).toBe(first._id.toString());
    expect(after.totalPaise).toBe(36400);
    expect(await net("delivery-income")).toBe(-2900);
    expect(await trialBalanceIsZero()).toBe(0);
  });

  it("voids the sale and cost of goods when the order is cancelled, but keeps the courier cost", async () => {
    const { order } = await realOrder();
    await reconcileAll({ stock: false });

    await Order.updateOne({ _id: order._id }, { orderStatus: "Cancelled" });
    const result = await reconcileAll({ stock: false });

    expect(result.voided).toBe(2);
    expect(await live("order-sale")).toHaveLength(0);
    expect(await live("order-cogs")).toHaveLength(0);
    expect(await live("order-courier")).toHaveLength(1);
    expect(await net("sales-online")).toBe(0);
    expect(await net("courier")).toBe(8400);
    expect(await trialBalanceIsZero()).toBe(0);

    // Tidying the cancelled order away (soft delete) keeps the courier
    // charge that was really paid (round 28).
    await Order.updateOne({ _id: order._id }, { isActive: false });
    await reconcileAll({ stock: false });
    expect(await live("order-courier")).toHaveLength(1);
  });

  it("posts nothing for an order that has not shipped; sale still posts if the cost snapshot is missing", async () => {
    const { order } = await realOrder({ orderStatus: "Processing", statusHistory: [{ status: "Pending", changedAt: new Date() }] });
    await reconcileAll({ stock: false });
    expect(await Voucher.countDocuments({})).toBe(0);

    await Order.updateOne({ _id: order._id }, { orderStatus: "Shipped", statusHistory: shippedOn("2026-08-10") });
    await OrderCost.deleteMany({});
    const result = await reconcileAll({ stock: false });

    expect(result.missingCost).toBe(1);
    expect(await live("order-sale")).toHaveLength(1);
    expect(await live("order-cogs")).toHaveLength(0);
    expect(await live("order-courier")).toHaveLength(0);
  });

  it("posts a COD order to the courier receivable, counting the COD charge as delivery income", async () => {
    await realOrder({ paymentMethod: "COD", isPaid: false, deliveryFee: 0, codCharge: 50, discountAmount: 0, totalPrice: 385 });
    await reconcileAll({ stock: false });

    expect(await net("cod-receivable")).toBe(38500);
    expect(await net("razorpay")).toBe(0);
    expect(await net("sales-online")).toBe(-33500);
    expect(await net("delivery-income")).toBe(-5000);
    expect(await trialBalanceIsZero()).toBe(0);
  });

  it("books the sale on its shipped date, and falls back to the first open day if that period is locked", async () => {
    await realOrder();
    await ensureAccountingSeed();
    await AccountingSettings.updateOne({ key: "main" }, { $set: { lockedThrough: new Date("2026-08-31T12:00:00+05:30") } });

    const result = await reconcileAll({ stock: false });
    expect(result.created).toBe(3);

    const [sale] = await live("order-sale");
    expect(toIstDateString(sale.date)).toBe("2026-09-01");
  });

  it("will not touch an existing voucher inside a locked period", async () => {
    const { order } = await realOrder();
    await reconcileAll({ stock: false });

    await AccountingSettings.updateOne({ key: "main" }, { $set: { lockedThrough: new Date("2026-08-31T12:00:00+05:30") } });
    await Order.updateOne({ _id: order._id }, { totalPrice: 400 });

    const result = await reconcileAll({ stock: false });
    expect(result.skipped.locked).toBeGreaterThanOrEqual(1);
    expect((await live("order-sale"))[0].totalPaise).toBe(35400); // unchanged

    await Order.updateOne({ _id: order._id }, { orderStatus: "Cancelled" });
    const voidAttempt = await reconcileAll({ stock: false });
    expect(voidAttempt.skipped.locked).toBeGreaterThanOrEqual(2);
    expect(await live("order-sale")).toHaveLength(1);
  });
});

describe("auto-posting: automatic vouchers are not edited or deleted by hand", () => {
  it("refuses to delete or edit an automatic voucher through the vouchers API", async () => {
    const auth = await adminAuth();
    await realOrder();
    await reconcileAll({ stock: false });
    const [sale] = await live("order-sale");

    const del = await request(app).delete(`/api/admin/accounts/vouchers/${sale._id}`).set(auth);
    expect(del.status).toBe(400);
    expect(del.body.message).toMatch(/automatically/i);

    const put = await request(app).put(`/api/admin/accounts/vouchers/${sale._id}`).set(auth).send({ date: "2026-08-10", entries: [] });
    expect(put.status).toBe(400);

    expect(await live("order-sale")).toHaveLength(1);
  });
});

describe("auto-posting: live hooks", () => {
  it("posts immediately when an admin marks an order Shipped, and again when the courier charge is entered", async () => {
    const auth = await adminAuth();
    const { order } = await realOrder({ orderStatus: "Pending", statusHistory: [{ status: "Pending", changedAt: new Date() }] });
    await OrderCost.updateOne({ order: order._id }, { $set: { courierCharge: null } });

    expect(await Voucher.countDocuments({})).toBe(0);

    const ship = await request(app).put(`/api/orders/${order._id}/status`).set(auth).send({ status: "Shipped" });
    expect(ship.status).toBe(200);
    expect(await live("order-sale")).toHaveLength(1);
    expect(await live("order-cogs")).toHaveLength(1);
    expect(await live("order-courier")).toHaveLength(0);

    const courier = await request(app).put(`/api/orders/${order._id}/cost`).set(auth).send({ courierCharge: 84 });
    expect(courier.status).toBe(200);
    expect((await live("order-courier"))[0].totalPaise).toBe(8400);

    const cancel = await request(app).put(`/api/orders/${order._id}/status`).set(auth).send({ status: "Cancelled" });
    expect(cancel.status).toBe(200);
    expect(await live("order-sale")).toHaveLength(0);
    expect(await live("order-cogs")).toHaveLength(0);
    expect(await trialBalanceIsZero()).toBe(0);
  });

  it("never fails the order status change because of the books", async () => {
    const auth = await adminAuth();
    const { order } = await realOrder({ orderStatus: "Pending", statusHistory: [{ status: "Pending", changedAt: new Date() }] });

    // Break the books: remove a system ledger the sale posting needs.
    await (await import("../models/Ledger.js")).default.deleteMany({ systemKey: "sales-online" });

    const ship = await request(app).put(`/api/orders/${order._id}/status`).set(auth).send({ status: "Shipped" });
    expect(ship.status).toBe(200);
    expect((await Order.findById(order._id)).orderStatus).toBe("Shipped");
  });
});

describe("auto-posting: returns", () => {
  it("posts a prorated sales return and puts the returned stock back at cost", async () => {
    const { order, product, user } = await realOrder({ orderStatus: "Delivered", totalPrice: 320 });
    const rr = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Wrong colour",
      status: "Refunded",
      stockRestored: true,
    });
    await reconcileAll({ stock: false });

    const fresh = await Order.findById(order._id).lean();
    const expected = Math.round(returnedValueFor(fresh, fresh.orderItems[0], 1) * 100);
    expect(expected).toBe(Math.round(335 * (1 - 34 / 335) * 100)); // item price minus its share of the coupon = 301

    expect((await live("return-refund"))[0].totalPaise).toBe(expected);
    expect(await net("sales-returns")).toBe(expected);
    expect(await net("razorpay")).toBe(32000 - expected);

    expect((await live("return-stock"))[0].totalPaise).toBe(19300);
    expect(await net("stock")).toBe(-19300 + 19300);
    expect(await net("cogs")).toBe(0);
    expect(await trialBalanceIsZero()).toBe(0);

    // A rejected return posts nothing; reverting to non-refunded voids it.
    await ReturnRequest.updateOne({ _id: rr._id }, { status: "Requested", stockRestored: false });
    await reconcileAll({ stock: false });
    expect(await live("return-refund")).toHaveLength(0);
    expect(await live("return-stock")).toHaveLength(0);
  });

  it("uses the same refund figure as the return flow itself", async () => {
    const auth = await adminAuth();
    const { order, product, user } = await realOrder({ orderStatus: "Delivered" });
    const rr = await ReturnRequest.create({
      order: order._id, user: user._id, product: product._id, productName: product.name, quantity: 1, reason: "Defect", status: "Approved",
    });

    const res = await request(app).put(`/api/returns/${rr._id}/status`).set(auth).send({ status: "Refunded" });
    expect(res.status).toBe(200);

    const refunded = (await Order.findById(order._id)).refundedAmount;
    expect((await live("return-refund"))[0].totalPaise).toBe(Math.round(refunded * 100));
  });
});

describe("auto-posting: POS sales", () => {
  const sale = async (user, product, overrides = {}) => {
    const doc = await OfflineSale.create({
      items: [{ product: product._id, productName: product.name, quantity: 2, unitPrice: 300, originalPrice: 300, subtotal: 600 }],
      discountAmount: 50,
      totalAmount: 550,
      paymentMethod: "Cash",
      soldBy: user._id,
      ...overrides,
    });
    await OfflineSaleCost.create({ sale: doc._id, items: [{ product: product._id, quantity: 2, unitPurchasePrice: 100, unitMiscExpenses: 10 }] });
    return doc;
  };

  it("posts cash sales to Cash and UPI/Card sales to the bank, with cost of goods", async () => {
    const user = await createUser({ role: "admin" });
    const product = await createProduct({ price: 300 });
    await sale(user, product);
    await sale(user, product, { paymentMethod: "UPI" });

    await reconcileAll({ stock: false });

    expect(await net("cash")).toBe(55000);
    expect(await net("bank-main")).toBe(55000);
    expect(await net("sales-pos")).toBe(-120000);
    expect(await net("discount")).toBe(10000);
    expect(await net("cogs")).toBe(44000);
    expect(await net("stock")).toBe(-44000);
    expect(await trialBalanceIsZero()).toBe(0);
  });

  it("voids the vouchers when a sale is voided, and sweeps them when the sale is deleted", async () => {
    const user = await createUser({ role: "admin" });
    const product = await createProduct({ price: 300 });
    const a = await sale(user, product);
    const b = await sale(user, product);
    await reconcileAll({ stock: false });
    expect(await live("pos-sale")).toHaveLength(2);

    await OfflineSale.updateOne({ _id: a._id }, { voided: true, voidedAt: new Date() }); // a real void stamps voidedAt
    await OfflineSale.deleteOne({ _id: b._id });
    const result = await reconcileAll({ stock: false });

    expect(result.voided).toBe(4);
    expect(await live("pos-sale")).toHaveLength(0);
    expect(await live("pos-cogs")).toHaveLength(0);
    expect(await trialBalanceIsZero()).toBe(0);
  });
});

describe("auto-posting: expenses", () => {
  const expenseBody = (o = {}) => ({ date: "2026-09-05", category: "Software & Subscriptions", amount: 2500, vendor: "Anthropic", paymentMode: "Card", ...o });

  it("posts each expense to its ledger, paid from capital; edits in place; voids on delete", async () => {
    const auth = await adminAuth();
    const created = await request(app).post("/api/admin/expenses").set(auth).send(expenseBody());
    expect(created.status).toBe(201);

    const [v] = await live("expense");
    expect(v.type).toBe("Payment");
    expect(v.totalPaise).toBe(250000);
    expect(await net("software")).toBe(250000);
    expect(await net("capital")).toBe(-250000);

    const edit = await request(app).put(`/api/admin/expenses/${created.body.expense._id}`).set(auth).send({ amount: 2412.5, category: "Domain & Hosting" });
    expect(edit.status).toBe(200);
    const [after] = await live("expense");
    expect(after.number).toBe(v.number);
    expect(after.totalPaise).toBe(241250);
    expect(await net("software")).toBe(0);
    expect(await net("domain")).toBe(241250);

    const del = await request(app).delete(`/api/admin/expenses/${created.body.expense._id}`).set(auth);
    expect(del.status).toBe(200);
    expect(await live("expense")).toHaveLength(0);
    expect(await net("domain")).toBe(0);
    expect(await trialBalanceIsZero()).toBe(0);
  });

  it("posts auto-generated subscription entries too", async () => {
    const auth = await adminAuth();
    const res = await request(app).post("/api/admin/expenses/recurring").set(auth).send({
      name: "Claude", category: "Software & Subscriptions", amount: 2500, billing: "monthly", startDate: "2026-07-28",
    });
    expect(res.status).toBe(201);

    const entries = await Expense.countDocuments({});
    expect(entries).toBeGreaterThanOrEqual(3);
    expect(await live("expense")).toHaveLength(entries);
    expect(await net("software")).toBe(250000 * entries);
  });

  it("skips an expense dated before the books start, and reports it", async () => {
    await Expense.create({ date: new Date("2026-03-01T12:00:00+05:30"), category: "Packaging", amount: 100 });
    const result = await reconcileAll({ stock: false });

    expect(result.skipped["before-books-start"]).toBe(1);
    expect(await Voucher.countDocuments({})).toBe(0);
  });

  it("repairs an expense whose posting failed earlier (next sync catches it)", async () => {
    const e = await Expense.create({ date: new Date("2026-09-05T12:00:00+05:30"), category: "Packaging", amount: 100 });
    expect(await Voucher.countDocuments({})).toBe(0);

    await reconcileAll({ stock: false });
    expect(await live("expense")).toHaveLength(1);

    await syncExpense(e._id);
    expect(await live("expense")).toHaveLength(1);
  });
});

describe("auto-posting: stock valuation", () => {
  it("brings Stock in Hand up to the live valuation, then does nothing when nothing changed", async () => {
    await createProduct({ price: 500, purchasePrice: 100, miscExpenses: 10, stock: 10 });

    const first = await reconcileAll();
    expect(first.stock.diffPaise).toBe(110000);
    expect(await net("stock")).toBe(110000);
    expect(await net("capital")).toBe(-110000);

    const second = await reconcileAll();
    expect(second.stock.diffPaise).toBe(0);
    expect(await Voucher.countDocuments({ "source.kind": "stock-sync" })).toBe(1);
  });

  it("writes off a reduction that is not linked to a sale, and values variant stock per size", async () => {
    const product = await createProduct({
      price: 500, purchasePrice: 100, miscExpenses: 10, stock: 10,
      variants: [
        { size: "7x4", price: 500, stock: 4, purchasePrice: 100 },
        { size: "9x4", price: 700, stock: 6, purchasePrice: 200 },
      ],
    });
    await reconcileAll();
    expect(await net("stock")).toBe(Math.round((4 * 110 + 6 * 210) * 100));

    await Product.updateOne({ _id: product._id }, { $set: { "variants.0.stock": 2 } });
    const result = await reconcileAll();

    expect(result.stock.diffPaise).toBe(-22000);
    expect(await net("stock-writeoff")).toBe(22000);
    expect(await trialBalanceIsZero()).toBe(0);
  });

  it("counts stock reserved by an unshipped order, so shipping it does not cause a phantom difference", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 335, purchasePrice: 100, miscExpenses: 10, stock: 9 }); // 10 originally, 1 reserved
    const order = await createOrder({
      user, products: [product],
      overrides: { orderStatus: "Pending", totalPrice: 335, statusHistory: [{ status: "Pending", changedAt: new Date("2026-08-10T10:00:00+05:30") }] },
    });
    await OrderCost.create({ order: order._id, items: [{ product: product._id, size: "", quantity: 1, unitPurchasePrice: 100, unitMiscExpenses: 10 }] });

    const first = await reconcileAll();
    expect(first.stock.diffPaise).toBe(110000); // 9 on shelf + 1 reserved = 10 x Rs 110

    await Order.updateOne({ _id: order._id }, { orderStatus: "Shipped", statusHistory: shippedOn("2026-08-10") });
    const second = await reconcileAll();

    expect(second.stock.diffPaise).toBe(0);
    expect(await net("stock")).toBe(99000); // 9 x 110 left
    expect(await net("stock-writeoff")).toBe(0);
    expect(await trialBalanceIsZero()).toBe(0);
  });
});

describe("auto-posting: sync endpoint", () => {
  it("requires the accounts permission", async () => {
    const role = await Role.create({ name: "Orders only", permissions: ["orders"] });
    const staff = await createUser({ role: "admin", adminRole: role._id });
    const res = await request(app).post("/api/admin/accounts/sync").set("Authorization", `Bearer ${signToken(staff)}`);
    expect(res.status).toBe(403);

    expect((await request(app).post("/api/admin/accounts/sync")).status).toBe(401);
  });

  it("syncs everything and reports what it did", async () => {
    const auth = await adminAuth();
    await realOrder();
    await createProduct({ price: 500, purchasePrice: 100, miscExpenses: 10, stock: 3 });
    await Expense.create({ date: new Date("2026-09-05T12:00:00+05:30"), category: "Packaging", amount: 100 });

    const res = await request(app).post("/api/admin/accounts/sync").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.result.created).toBe(4); // sale + cogs + courier + expense
    expect(res.body.result.stockAdjustment).toBeGreaterThan(0);

    const again = await request(app).post("/api/admin/accounts/sync").set(auth);
    expect(again.body.result.created).toBe(0);
    expect(again.body.result.stockAdjustment).toBe(0);
  });

  it("two simultaneous syncs never double-post", async () => {
    await realOrder();
    await createProduct({ price: 500, purchasePrice: 100, miscExpenses: 10, stock: 3 });
    await Expense.create({ date: new Date("2026-09-05T12:00:00+05:30"), category: "Packaging", amount: 100 });

    const results = await Promise.all([reconcileAll(), reconcileAll(), reconcileAll()]);

    expect(results.some((r) => !r.busy)).toBe(true);
    expect(await Voucher.countDocuments({ "source.kind": "stock-sync" })).toBe(1);
    expect(await live("order-sale")).toHaveLength(1);
    expect(await live("expense")).toHaveLength(1);
    expect(await trialBalanceIsZero()).toBe(0);
  });
});

describe("round 28 fixes", () => {
  it("a lock covering today never makes the stock sync post the same difference again", async () => {
    await createProduct({ price: 500, purchasePrice: 100, miscExpenses: 0, stock: 10 });
    await ensureAccountingSeed();
    // The API now refuses to lock today; set it directly to prove the sync itself is safe.
    await AccountingSettings.updateOne({ key: "main" }, { $set: { lockedThrough: new Date() } });

    await reconcileAll();
    await reconcileAll();
    await reconcileAll();

    const syncs = await Voucher.find({ "source.kind": "stock-sync", voided: false }).lean();
    expect(syncs).toHaveLength(1); // was 3 x Rs 1,000 before the fix
    expect(syncs[0].totalPaise).toBe(100000);
  });

  it("refuses to lock today or later through the API", async () => {
    const auth = await adminAuth();
    const today = toIstDateString(new Date());
    const res = await request(app).put("/api/admin/accounts/settings").set(auth).send({ lockedThrough: today });
    expect(res.status).toBe(400);
  });

  it("a busy sync never clears another run's lock", async () => {
    await ensureAccountingSeed();
    const until = new Date(Date.now() + 5 * 60 * 1000);
    await AccountingSettings.updateOne({ key: "main" }, { $set: { syncLockUntil: until, syncLockOwner: "someone-else" } });

    const result = await reconcileAll();
    expect(result.busy).toBe(true);

    const s = await AccountingSettings.findOne({ key: "main" }).lean();
    expect(s.syncLockOwner).toBe("someone-else");
    expect(s.syncLockUntil.getTime()).toBe(until.getTime());
  });

  it("releases its own lock at the end, so the next sync can run", async () => {
    await realOrder();
    expect((await reconcileAll({ stock: false })).busy).toBeUndefined();
    const s = await AccountingSettings.findOne({ key: "main" }).lean();
    expect(s.syncLockUntil).toBeNull();
    expect(s.syncLockOwner).toBeNull();
    expect((await reconcileAll({ stock: false })).busy).toBeUndefined();
  });

  it("leaves a POS sale's vouchers alone while it is being edited (mutex), but voids a real void", async () => {
    const user = await createUser({ role: "admin" });
    const product = await createProduct({ price: 300 });
    const doc = await OfflineSale.create({
      items: [{ product: product._id, productName: product.name, quantity: 1, unitPrice: 300, originalPrice: 300, subtotal: 300 }],
      totalAmount: 300,
      paymentMethod: "Cash",
      soldBy: user._id,
    });
    await OfflineSaleCost.create({ sale: doc._id, items: [{ product: product._id, quantity: 1, unitPurchasePrice: 100, unitMiscExpenses: 0 }] });
    await reconcileAll({ stock: false });
    expect(await live("pos-sale")).toHaveLength(1);

    await OfflineSale.updateOne({ _id: doc._id }, { voided: true }); // edit mutex: no voidedAt
    await reconcileAll({ stock: false });
    expect(await live("pos-sale")).toHaveLength(1);
    expect(await live("pos-cogs")).toHaveLength(1);

    await OfflineSale.updateOne({ _id: doc._id }, { voided: true, voidedAt: new Date() }); // real void
    await reconcileAll({ stock: false });
    expect(await live("pos-sale")).toHaveLength(0);
  });

  it("keeps a courier charge that was really paid when a shipped-then-cancelled order is deleted", async () => {
    const auth = await adminAuth();
    const { order } = await realOrder();
    await reconcileAll({ stock: false });

    await Order.updateOne({ _id: order._id }, { orderStatus: "Cancelled" });
    await Order.updateOne({ _id: order._id }, { isActive: false }); // soft delete
    await reconcileAll({ stock: false });
    expect(await live("order-courier")).toHaveLength(1);

    await Order.deleteOne({ _id: order._id }); // permanent delete
    await reconcileAll({ stock: false });
    await syncOrder(order._id);
    expect(await live("order-courier")).toHaveLength(1);
    expect(await live("order-sale")).toHaveLength(0);
    expect(await net("courier")).toBe(8400);
    expect(auth).toBeTruthy();
  });

  it("dates refund and returned-stock vouchers from when they happened, not from later edits", async () => {
    const { order, product, user } = await realOrder({ orderStatus: "Delivered" });
    const rr = await ReturnRequest.create({
      order: order._id, user: user._id, product: product._id, productName: product.name, quantity: 1, reason: "x",
      status: "Refunded", stockRestored: true,
      refundedAt: new Date("2026-08-20T10:00:00+05:30"), stockRestoredAt: new Date("2026-08-18T10:00:00+05:30"),
    });
    await reconcileAll({ stock: false });
    expect(toIstDateString((await live("return-refund"))[0].date)).toBe("2026-08-20");
    expect(toIstDateString((await live("return-stock"))[0].date)).toBe("2026-08-18");

    // a later touch (admin note) must not move them
    await ReturnRequest.updateOne({ _id: rr._id }, { adminNote: "checked again" });
    const again = await reconcileAll({ stock: false });
    expect(again.updated).toBe(0);
    expect(toIstDateString((await live("return-refund"))[0].date)).toBe("2026-08-20");
  });

  it("stamps refundedAt / stockRestoredAt through the real return flow", async () => {
    const auth = await adminAuth();
    const { order, product, user } = await realOrder({ orderStatus: "Delivered" });
    const rr = await ReturnRequest.create({
      order: order._id, user: user._id, product: product._id, productName: product.name, quantity: 1, reason: "x", status: "Approved",
    });
    const res = await request(app).put(`/api/returns/${rr._id}/status`).set(auth).send({ status: "Refunded" });
    expect(res.status).toBe(200);

    const fresh = await ReturnRequest.findById(rr._id);
    expect(fresh.refundedAt).toBeInstanceOf(Date);
    expect(fresh.stockRestoredAt).toBeInstanceOf(Date);
  });

  it("refuses an opening-balance change while the books are locked, but not an unchanged resend", async () => {
    const auth = await adminAuth();
    await ensureAccountingSeed();
    const map = await getSystemLedgerMap();
    const sbi = String(map.get("bank-main"));
    await AccountingSettings.updateOne({ key: "main" }, { $set: { lockedThrough: new Date("2026-05-31T12:00:00+05:30") } });

    const change = await request(app).put(`/api/admin/accounts/ledgers/${sbi}`).set(auth).send({ openingBalance: 500, openingSide: "Dr" });
    expect(change.status).toBe(400);

    const resend = await request(app).put(`/api/admin/accounts/ledgers/${sbi}`).set(auth).send({ name: "SBI A/C", openingBalance: 0, openingSide: "Dr", notes: "main bank" });
    expect(resend.status).toBe(200);
  });
});
