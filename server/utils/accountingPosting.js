import crypto from "crypto";
import mongoose from "mongoose";

import Order from "../models/Order.js";
import OrderCost from "../models/OrderCost.js";
import OfflineSale from "../models/OfflineSale.js";
import OfflineSaleCost from "../models/OfflineSaleCost.js";
import ReturnRequest from "../models/ReturnRequest.js";
import Expense from "../models/Expense.js";
import Product from "../models/Product.js";
import Voucher from "../models/Voucher.js";
import { AccountingSettings } from "../models/AccountingMisc.js";
import { EXPENSE_CATEGORY_LEDGER } from "../config/accountingDefaults.js";
import {
  ensureAccountingSeed,
  getSettings,
  getSystemLedgerMap,
  getLedgerBalances,
  createAutoVoucher,
  rebuildAutoVoucher,
  voidAutoVoucher,
} from "./accounting.js";
import { parseIstDate, toIstDateString } from "./recurringExpenses.js";
import { returnedValueFor } from "./returnValue.js";

// Automatic posting: turns orders, returns, POS sales and expenses into
// vouchers. Everything here is a RECONCILE -- "given this source document,
// what should its voucher(s) look like?" -- compared with what exists, so it
// can be run any number of times (after an edit, on page load, by two people
// at once) and always converges on the same books:
//
//   desired === undefined -> leave whatever exists untouched (cannot decide
//                            yet, e.g. the cost snapshot is missing)
//   desired === null      -> nothing should exist: void the voucher if any
//   desired = {...}       -> create it, or fix it in place if figures changed
//
// Each source document owns vouchers keyed {source.kind, source.id}; a unique
// index guarantees at most one live voucher per key.

const paise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const shortId = (id) => String(id).slice(-8).toUpperCase();
const noonIst = (date) => parseIstDate(toIstDateString(new Date(date)));
const SHIPPED = ["Shipped", "Delivered"];

const hashOf = (d) =>
  crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        type: d.type,
        date: toIstDateString(d.date),
        narration: d.narration,
        entries: d.entries.map((e) => [String(e.ledger), e.side, e.amountPaise]),
      }),
    )
    .digest("hex");

// Tolerant line builder: skips zero amounts so callers can list every
// possible line and only the positive ones are posted.
const lines = (...rows) =>
  rows.filter(([, , amount]) => amount > 0).map(([ledger, side, amountPaise]) => ({ ledger, side, amountPaise }));

// ----------------------------------------------------------- reconcile
const newStats = () => ({
  created: 0,
  updated: 0,
  voided: 0,
  unchanged: 0,
  skipped: { locked: 0, "before-books-start": 0 },
  missingCost: 0,
});

const reconcileSource = async (kind, id, desired, ctx) => {
  const { settings, stats } = ctx;

  if (desired === undefined) return;

  // A full sync preloads every live automatic voucher once (ctx.voucherIndex)
  // instead of one query per source document.
  const existing = ctx.voucherIndex
    ? ctx.voucherIndex.get(`${kind}|${String(id)}`) || null
    : await Voucher.findOne({ "source.kind": kind, "source.id": String(id), voided: false }).lean();

  if (desired === null) {
    if (!existing) return;

    const r = await voidAutoVoucher(existing, settings);
    if (r.voided) stats.voided += 1;
    else stats.skipped[r.skipped] += 1;
    return;
  }

  const hash = hashOf(desired);
  const source = { kind, id: String(id), hash };

  if (existing) {
    if (existing.source?.hash === hash) {
      stats.unchanged += 1;
      return;
    }

    const r = await rebuildAutoVoucher(existing, desired, hash, settings);

    if (r.updated) {
      stats.updated += 1;
    } else if (r.recreate) {
      await voidAutoVoucher(existing, settings);
      const created = await createAutoVoucher(desired, source, settings);
      if (created.created) stats.created += 1;
    } else if (r.skipped) {
      stats.skipped[r.skipped] += 1;
    }
    return;
  }

  const created = await createAutoVoucher(desired, source, settings);
  if (created.created) stats.created += 1;
  else if (created.skipped) stats.skipped[created.skipped] += 1;
};

// -------------------------------------------------------------- orders
const shipDateOf = (order) => {
  const hit = (order.statusHistory || []).find((h) => SHIPPED.includes(h.status));
  if (hit?.changedAt) return new Date(hit.changedAt);
  if (SHIPPED.includes(order.orderStatus)) return new Date(order.updatedAt);
  return null;
};

const orderIsSold = (order) => order.isActive !== false && SHIPPED.includes(order.orderStatus);

const costTotals = (items) => {
  const total = items.reduce(
    (sum, i) => sum + Math.round(i.quantity * ((i.unitPurchasePrice || 0) + (i.unitMiscExpenses || 0)) * 100),
    0,
  );
  return total;
};

const orderSaleDesired = (order, L) => {
  if (!orderIsSold(order)) return null;

  const total = paise(order.totalPrice);
  if (total < 1) return null;

  const deliveryIncome = paise(order.deliveryFee) + paise(order.codCharge);
  const discounts = paise(order.discountAmount) + paise(order.bundleDiscountAmount) + paise(order.pointsDiscount);
  // The amount the customer pays is authoritative; sales is whatever
  // remains once delivery income is taken out and discounts added back.
  const sales = Math.max(0, total + discounts - deliveryIncome);
  const credits = sales + Math.min(deliveryIncome, total + discounts);

  const itemsPaise = (order.orderItems || []).reduce((s, i) => s + Math.round(i.price * i.quantity * 100), 0);
  const note = itemsPaise !== sales ? ` [items total ₹${itemsPaise / 100} differs]` : "";

  const receivable = L(order.paymentMethod === "Razorpay" ? "razorpay" : "cod-receivable");

  return {
    type: "Sales",
    date: noonIst(shipDateOf(order)),
    narration: `Online order #${shortId(order._id)} (${order.paymentMethod})${note}`,
    entries: lines(
      [receivable, "Dr", total],
      [L("discount"), "Dr", discounts],
      [L("sales-online"), "Cr", sales],
      [L("delivery-income"), "Cr", credits - sales],
    ),
  };
};

const orderCogsDesired = (order, cost, L) => {
  if (!orderIsSold(order)) return null;
  if (!cost) return undefined;

  const amount = costTotals(cost.items);
  if (amount < 1) return null;

  return {
    type: "Journal",
    date: noonIst(shipDateOf(order)),
    narration: `Cost of goods sold - order #${shortId(order._id)}`,
    entries: lines([L("cogs"), "Dr", amount], [L("stock"), "Cr", amount]),
  };
};

// The courier was paid once the parcel went out, even if the order was
// cancelled -- or the cancelled order tidied away (soft-deleted) -- later,
// so this follows "was it ever shipped" only, not the status or the
// active flag.
const orderCourierDesired = (order, cost, L) => {
  const shipped = shipDateOf(order);
  if (!shipped) return null;
  if (!cost) return undefined;

  const amount = paise(cost.courierCharge);
  if (amount < 1) return null;

  return {
    type: "Payment",
    date: noonIst(shipped),
    narration: `Courier charge - order #${shortId(order._id)}${cost.courierNote ? ` (${cost.courierNote})` : ""}`,
    entries: lines([L("courier"), "Dr", amount], [L("capital"), "Cr", amount]),
  };
};

// ------------------------------------------------------------- returns
const returnLineOf = (order, rr) =>
  (order.orderItems || []).find((item) => String(item.product) === String(rr.product));

const returnRefundDesired = (rr, order, L) => {
  if (rr.status !== "Refunded" || !order) return null;

  const item = returnLineOf(order, rr);
  if (!item) return null;

  const amount = paise(returnedValueFor(order, item, rr.quantity));
  if (amount < 1) return null;

  return {
    type: "Journal",
    // When it was refunded -- not updatedAt, which moves on every later
    // touch (admin note, "seen" flag) and would re-date the voucher.
    date: noonIst(rr.refundedAt || rr.updatedAt),
    narration: `Sales return - order #${shortId(order._id)} (${rr.productName})`,
    // Prepaid refunds come out of the Razorpay balance; a COD refund is paid by the owner.
    entries: lines([L("sales-returns"), "Dr", amount], [L(order.paymentMethod === "Razorpay" ? "razorpay" : "capital"), "Cr", amount]),
  };
};

const returnStockDesired = (rr, order, cost, L) => {
  if (!rr.stockRestored || !order || !orderIsSold(order)) return null;
  if (!cost) return undefined;

  const item = cost.items.find((i) => String(i.product) === String(rr.product) && (i.size || "") === (rr.size || ""));
  if (!item) return undefined;

  const amount = Math.round(rr.quantity * ((item.unitPurchasePrice || 0) + (item.unitMiscExpenses || 0)) * 100);
  if (amount < 1) return null;

  return {
    type: "Journal",
    date: noonIst(rr.stockRestoredAt || rr.updatedAt),
    narration: `Returned stock back in hand - order #${shortId(order._id)} (${rr.productName})`,
    entries: lines([L("stock"), "Dr", amount], [L("cogs"), "Cr", amount]),
  };
};

// ----------------------------------------------------------------- POS
// `voided: true` WITHOUT voidedAt is posController's short-lived edit /
// delete mutex, not a real void: leave the books alone while it is held
// (a real void always stamps voidedAt; a deleted sale is swept as an orphan).
const posVoidState = (sale) => (sale.voided ? (sale.voidedAt ? null : undefined) : "live");

const posSaleDesired = (sale, L) => {
  if (posVoidState(sale) !== "live") return posVoidState(sale);

  const total = paise(sale.totalAmount);
  const discount = paise(sale.discountAmount);
  if (total + discount < 1) return null;

  return {
    type: "Sales",
    date: noonIst(sale.createdAt),
    narration: `POS sale (${sale.paymentMethod})`,
    entries: lines(
      [L(sale.paymentMethod === "Cash" ? "cash" : "bank-main"), "Dr", total],
      [L("discount"), "Dr", discount],
      [L("sales-pos"), "Cr", total + discount],
    ),
  };
};

const posCogsDesired = (sale, cost, L) => {
  if (posVoidState(sale) !== "live") return posVoidState(sale);
  if (!cost) return undefined;

  const amount = costTotals(cost.items);
  if (amount < 1) return null;

  return {
    type: "Journal",
    date: noonIst(sale.createdAt),
    narration: "Cost of goods sold - POS sale",
    entries: lines([L("cogs"), "Dr", amount], [L("stock"), "Cr", amount]),
  };
};

// ------------------------------------------------------------ expenses
const expenseDesired = (expense, L) => {
  if (expense.voided) return null;

  const amount = paise(expense.amount);
  if (amount < 1) return null;

  const label = expense.note || expense.category;

  return {
    type: "Payment",
    date: noonIst(expense.date),
    narration: (expense.vendor ? `${expense.vendor}: ${label}` : label).slice(0, 200),
    // Paid from the owner's capital for now (the user's chosen setup).
    entries: lines([L(EXPENSE_CATEGORY_LEDGER[expense.category] || "other-expense"), "Dr", amount], [L("capital"), "Cr", amount]),
  };
};

// ---------------------------------------------------- targeted syncs
const makeContext = async () => {
  await ensureAccountingSeed();

  const [settings, map] = await Promise.all([getSettings(), getSystemLedgerMap()]);
  const L = (key) => {
    const id = map.get(key);
    if (!id) throw new Error(`System ledger "${key}" is missing`);
    return id;
  };

  return { settings, L, stats: newStats() };
};

const syncOrderWith = async (order, ctx) => {
  const cost = ctx.orderCosts
    ? ctx.orderCosts.get(String(order._id)) || null
    : await OrderCost.findOne({ order: order._id }).lean();
  const id = String(order._id);

  await reconcileSource("order-sale", id, orderSaleDesired(order, ctx.L), ctx);

  const cogs = orderCogsDesired(order, cost, ctx.L);
  if (cogs === undefined && orderIsSold(order)) ctx.stats.missingCost += 1;
  await reconcileSource("order-cogs", id, cogs, ctx);

  await reconcileSource("order-courier", id, orderCourierDesired(order, cost, ctx.L), ctx);
};

export const syncOrder = async (orderId) => {
  const ctx = await makeContext();
  const order = await Order.findById(orderId).lean();

  if (order) {
    await syncOrderWith(order, ctx);
  } else {
    // Permanently deleted: the sale and its cost of goods go, but a courier
    // charge that was really paid stays in the books.
    for (const kind of ["order-sale", "order-cogs"]) await reconcileSource(kind, orderId, null, ctx);
    if (!(await courierWasPaid(orderId))) await reconcileSource("order-courier", orderId, null, ctx);
  }

  return ctx.stats;
};

const syncReturnWith = async (rr, ctx) => {
  const order = ctx.orderById
    ? ctx.orderById.get(String(rr.order)) || null
    : await Order.findById(rr.order).lean();
  const cost = !order
    ? null
    : ctx.orderCosts
      ? ctx.orderCosts.get(String(order._id)) || null
      : await OrderCost.findOne({ order: order._id }).lean();

  await reconcileSource("return-refund", String(rr._id), returnRefundDesired(rr, order, ctx.L), ctx);
  await reconcileSource("return-stock", String(rr._id), returnStockDesired(rr, order, cost, ctx.L), ctx);
};

export const syncReturn = async (returnId) => {
  const ctx = await makeContext();
  const rr = await ReturnRequest.findById(returnId).lean();

  if (rr) await syncReturnWith(rr, ctx);
  else for (const kind of ["return-refund", "return-stock"]) await reconcileSource(kind, returnId, null, ctx);

  return ctx.stats;
};

const syncPosSaleWith = async (sale, ctx) => {
  const cost = ctx.saleCosts
    ? ctx.saleCosts.get(String(sale._id)) || null
    : await OfflineSaleCost.findOne({ sale: sale._id }).lean();
  const id = String(sale._id);

  await reconcileSource("pos-sale", id, posSaleDesired(sale, ctx.L), ctx);
  await reconcileSource("pos-cogs", id, posCogsDesired(sale, cost, ctx.L), ctx);
};

export const syncPosSale = async (saleId) => {
  const ctx = await makeContext();
  const sale = await OfflineSale.findById(saleId).lean();

  if (sale) await syncPosSaleWith(sale, ctx);
  else for (const kind of ["pos-sale", "pos-cogs"]) await reconcileSource(kind, saleId, null, ctx);

  return ctx.stats;
};

// After subscriptions auto-generate new ledger entries (no controller call
// per entry), bring every expense's voucher up to date.
export const syncAllExpenses = async () => {
  const ctx = await makeContext();
  const expenses = await Expense.find().lean();

  for (const expense of expenses) await reconcileSource("expense", String(expense._id), expenseDesired(expense, ctx.L), ctx);
  await sweepOrphans(SOURCE_KINDS.expense, new Set(expenses.map((e) => String(e._id))), ctx, Expense);

  return ctx.stats;
};

export const syncExpense = async (expenseId) => {
  const ctx = await makeContext();
  const expense = await Expense.findById(expenseId).lean();

  await reconcileSource("expense", expenseId, expense ? expenseDesired(expense, ctx.L) : null, ctx);

  return ctx.stats;
};

// Hooks call these from inside money paths: a failure in the books must
// never fail or roll back the order/sale/expense itself.
export const postSafely = async (fn, ...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    console.error(`Accounting post (${fn.name}) failed:`, error);
    return null;
  }
};

// ------------------------------------------------------- stock valuation
// What the stock on hand is worth at cost: every active product's stock x
// (purchase + misc), PLUS stock already reserved by orders that haven't
// shipped yet. An order reserves stock the moment it is placed but its
// cost-of-goods only posts when it ships, so without this the in-between
// period would show a phantom shortfall (and double-count at shipment).
const computeStockValuePaise = async () => {
  const [products, openOrders, costs] = await Promise.all([
    Product.find({ isActive: true }).select("stock purchasePrice miscExpenses variants").lean(),
    Order.find({ isActive: { $ne: false }, orderStatus: { $in: ["Pending", "Processing"] } }).select("orderItems").lean(),
    OrderCost.find().lean(),
  ]);

  let total = 0;
  const productById = new Map();

  for (const p of products) {
    productById.set(String(p._id), p);
    const misc = p.miscExpenses || 0;

    if (p.variants?.length) {
      for (const v of p.variants) total += Math.round((v.stock || 0) * ((v.purchasePrice || 0) + misc) * 100);
    } else {
      total += Math.round((p.stock || 0) * ((p.purchasePrice || 0) + misc) * 100);
    }
  }

  const costByOrder = new Map(costs.map((c) => [String(c.order), c]));

  for (const order of openOrders) {
    const cost = costByOrder.get(String(order._id));

    for (const [i, item] of order.orderItems.entries()) {
      const snap = cost?.items?.[i];
      if (snap) {
        total += Math.round(item.quantity * ((snap.unitPurchasePrice || 0) + (snap.unitMiscExpenses || 0)) * 100);
        continue;
      }

      const p = productById.get(String(item.product));
      if (!p) continue;
      const unit = item.size
        ? (p.variants?.find((v) => v.size === item.size)?.purchasePrice || 0)
        : p.purchasePrice || 0;
      total += Math.round(item.quantity * (unit + (p.miscExpenses || 0)) * 100);
    }
  }

  return total;
};

// Brings the Stock in Hand ledger up to the live valuation. More stock than
// the books know about (an upload) is stock introduced from the owner's
// capital; less stock without a matching sale is a write-off.
// Book stock counts EVERY live voucher, with no "up to today" cap: a sync
// voucher can be dated after today (moved past a locked period), and capping
// would hide it from the next sync, which would then post the same
// difference again on every run.
const ALL_DATES = new Date("2999-12-31T12:00:00Z");

export const syncStockValue = async (ctx) => {
  const valuation = await computeStockValuePaise();
  const balances = await getLedgerBalances(ALL_DATES);
  const stockId = String(ctx.L("stock"));
  const book = balances.find((b) => String(b.ledger._id) === stockId)?.netPaise || 0;
  const diff = valuation - book;

  if (diff === 0) return { diffPaise: 0 };

  const desired =
    diff > 0
      ? {
          type: "Journal",
          date: noonIst(new Date()),
          narration: "Stock valuation sync: stock added / introduced from capital",
          entries: lines([ctx.L("stock"), "Dr", diff], [ctx.L("capital"), "Cr", diff]),
        }
      : {
          type: "Journal",
          date: noonIst(new Date()),
          narration: "Stock valuation sync: stock reduced (not linked to a sale)",
          entries: lines([ctx.L("stock-writeoff"), "Dr", -diff], [ctx.L("stock"), "Cr", -diff]),
        };

  const result = await createAutoVoucher(desired, { kind: "stock-sync", id: new Date().toISOString(), hash: "stock-sync" }, ctx.settings);

  return { diffPaise: result.created ? diff : 0, skipped: result.skipped };
};

// ------------------------------------------------------------- full sync
// The lock carries an owner token: only the run that took it can renew or
// release it, so a slow run whose lease ran out can never clear a newer
// run's lock (which would let a third run in alongside it).
const LOCK_LEASE_MS = 10 * 60 * 1000;

const acquireLock = async () => {
  const now = new Date();
  const token = crypto.randomUUID();
  const locked = await AccountingSettings.findOneAndUpdate(
    { key: "main", $or: [{ syncLockUntil: null }, { syncLockUntil: { $lt: now } }] },
    { $set: { syncLockUntil: new Date(now.getTime() + LOCK_LEASE_MS), syncLockOwner: token } },
    { returnDocument: "after" },
  );
  return locked ? token : null;
};

// Extends the lease; false if this run no longer holds the lock.
const renewLock = async (token) => {
  const r = await AccountingSettings.updateOne(
    { key: "main", syncLockOwner: token, syncLockUntil: { $gt: new Date() } },
    { $set: { syncLockUntil: new Date(Date.now() + LOCK_LEASE_MS) } },
  );
  return r.matchedCount === 1;
};

const releaseLock = (token) =>
  AccountingSettings.updateOne({ key: "main", syncLockOwner: token }, { $set: { syncLockUntil: null, syncLockOwner: null } });

const courierWasPaid = (orderId) =>
  mongoose.isValidObjectId(String(orderId))
    ? OrderCost.exists({ order: String(orderId), courierCharge: { $gt: 0 } })
    : null;

const SOURCE_KINDS = {
  order: ["order-sale", "order-cogs", "order-courier"],
  return: ["return-refund", "return-stock"],
  pos: ["pos-sale", "pos-cogs"],
  expense: ["expense"],
};

// Voids vouchers whose source document no longer exists (a deleted POS
// sale, a deleted expense...). `liveIds` was loaded earlier in the run, so
// before voiding re-check that the document really is gone -- one created
// meanwhile (whose voucher a hook just posted) must not be swept. A
// permanently deleted order keeps a courier charge that was really paid.
const sweepOrphans = async (kinds, liveIds, ctx, Model) => {
  const live = await Voucher.find({ "source.kind": { $in: kinds }, voided: false }).select("source date fy number type entries totalPaise").lean();

  for (const v of live) {
    const id = v.source.id;
    if (liveIds.has(id)) continue;
    if (!mongoose.isValidObjectId(id) || (await Model.exists({ _id: id }))) continue;
    if (v.source.kind === "order-courier" && (await courierWasPaid(id))) continue;

    await reconcileSource(v.source.kind, id, null, { ...ctx, voucherIndex: new Map([[`${v.source.kind}|${id}`, v]]) });
  }
};

// Reconciles EVERYTHING: all orders, returns, POS sales and expenses, then
// the stock valuation. Safe to run repeatedly; a second simultaneous run
// is refused (it reports `busy`) rather than racing the first.
export const reconcileAll = async ({ stock = true } = {}) => {
  const ctx = await makeContext();

  const token = await acquireLock();
  if (!token) return { busy: true, ...ctx.stats };

  try {
    // Load everything once (a handful of queries) instead of several
    // queries per document.
    const [orders, returns, sales, expenses, orderCosts, saleCosts, liveVouchers] = await Promise.all([
      Order.find().lean(),
      ReturnRequest.find().lean(),
      OfflineSale.find().lean(),
      Expense.find().lean(),
      OrderCost.find().lean(),
      OfflineSaleCost.find().lean(),
      Voucher.find({ "source.kind": { $type: "string" }, voided: false }).lean(),
    ]);

    ctx.orderById = new Map(orders.map((o) => [String(o._id), o]));
    ctx.orderCosts = new Map(orderCosts.map((c) => [String(c.order), c]));
    ctx.saleCosts = new Map(saleCosts.map((c) => [String(c.sale), c]));
    ctx.voucherIndex = new Map(liveVouchers.map((v) => [`${v.source.kind}|${v.source.id}`, v]));

    for (const order of orders) await syncOrderWith(order, ctx);
    for (const rr of returns) await syncReturnWith(rr, ctx);
    for (const sale of sales) await syncPosSaleWith(sale, ctx);
    for (const expense of expenses) await reconcileSource("expense", String(expense._id), expenseDesired(expense, ctx.L), ctx);

    await sweepOrphans(SOURCE_KINDS.order, new Set(orders.map((o) => String(o._id))), ctx, Order);
    await sweepOrphans(SOURCE_KINDS.return, new Set(returns.map((r) => String(r._id))), ctx, ReturnRequest);
    await sweepOrphans(SOURCE_KINDS.pos, new Set(sales.map((s) => String(s._id))), ctx, OfflineSale);
    await sweepOrphans(SOURCE_KINDS.expense, new Set(expenses.map((e) => String(e._id))), ctx, Expense);

    // Only post a stock difference while this run still holds the lock.
    const stockResult = stock && (await renewLock(token)) ? await syncStockValue(ctx) : null;

    return { ...ctx.stats, stock: stockResult };
  } finally {
    await releaseLock(token);
  }
};
