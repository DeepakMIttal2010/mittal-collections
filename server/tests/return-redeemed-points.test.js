import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  return { sendEmail: vi.fn() };
});
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// Real transactions: the refund, the restore, the earn clawback and a
// cancellation all run in them, as in production.
import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import ReturnRequest from "../models/ReturnRequest.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { applyLoyaltyPointsChange, expireDueLots, lotExpiryFor } from "../utils/loyaltyPoints.js";
import { returnedValueFor } from "../utils/returnValue.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// LY-01 (admin audit 2026-11-21, owner Option B; D1-D5 decided 2026-11-26).
// A refunded return gave back the cash net of the points discount but never
// the points behind that discount, so the customer lost them. Now the
// returned items' share of the redeemed points comes back:
//   restored so far = floor(pointsRedeemed x refunded raw item value / raw subtotal)
// D1 a batch that has expired: given back and expired again at once.
// D2 several batches: the latest expiry gets its points back first.
// D3 restored before the earn clawback of the same return; never settles
//    older points owed.
// D4 a redemption without batch records: a new legacy_refund batch, 365 days.
// D5 no backfill.
// A later cancellation gives back only what the returns did not.

beforeEach(async () => {
  sendEmail.mockReset().mockResolvedValue(undefined);
  await seedSiteSettings({ codCharge: 0 });
});
afterEach(() => vi.restoreAllMocks());

const DAY = 24 * 60 * 60 * 1000;

// lines: [{ price, quantity }]; lots: [{ points, days }] credited before the
// order, redeemed earliest expiry first (as checkout does).
const setup = async ({
  lines = [{ price: 1000 }, { price: 500 }],
  lots = [{ points: 150, days: 300 }],
  redeem = 150,
  legacyRedemption = false,
  overrides = {},
} = {}) => {
  const customer = await createUser();
  const admin = await createUser({ role: "admin" });
  const products = [];
  for (const line of lines) products.push(await createProduct({ price: line.price, stock: 10 }));

  const lotDocs = [];
  for (const [i, lot] of lots.entries()) {
    await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "admin_adjustment",
      source: "admin",
      points: lot.points,
      key: `test:lot:${i}:${customer._id}`,
      expiresAt: new Date(Date.now() + lot.days * DAY),
    });
    lotDocs.push(await LoyaltyLot.findOne({ key: `test:lot:${i}:${customer._id}` }));
  }

  const orderItems = lines.map((line, i) => ({
    product: products[i]._id,
    name: products[i].name,
    image: products[i].image,
    price: line.price,
    quantity: line.quantity || 1,
  }));
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = await Order.create({
    user: customer._id,
    orderItems,
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201001",
    },
    totalPrice: subtotal - redeem,
    pointsRedeemed: redeem,
    pointsDiscount: redeem,
    orderStatus: "Delivered",
    deliveredAt: new Date(),
    ...overrides,
  });

  if (redeem > 0 && legacyRedemption) {
    // Recorded before the batch scheme: no key, no allocations.
    await LoyaltyTransaction.create({
      user: customer._id,
      type: "redeemed",
      points: -redeem,
      balanceAfter: 0,
      order: order._id,
      description: `Redeemed on order ${order._id}`,
    });
  } else if (redeem > 0) {
    const res = await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "redeemed",
      source: "order",
      points: -redeem,
      key: `redeem:order:${order._id}`,
      order: order._id,
      description: `Redeemed on order ${order._id}`,
    });
    expect(res?.user).toBeDefined();
  }

  return { customer, adminToken: signToken(admin), products, order, lots: lotDocs };
};

const auth = (s) => ({ Authorization: `Bearer ${s.adminToken}` });

const openReturn = (s, index, { quantity = 1, status = "Requested" } = {}) =>
  ReturnRequest.create({
    order: s.order._id,
    user: s.customer._id,
    product: s.products[index]._id,
    productName: s.products[index].name,
    quantity,
    reason: "Didn't like it",
    status,
  });

const setReturnStatus = (s, id, status) =>
  request(app).put(`/api/returns/${id}/status`).set(auth(s)).send({ status });

const refundReturn = async (s, index, opts) => {
  const rr = await openReturn(s, index, opts);
  const res = await setReturnStatus(s, rr._id, "Refunded");
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return rr;
};

const cancelOrder = (s) =>
  request(app).put(`/api/orders/${s.order._id}/status`).set(auth(s)).send({ status: "Cancelled" });

const restoredTotal = async (s) => {
  const entries = await LoyaltyTransaction.find({ order: s.order._id, type: "refunded" });
  return entries.reduce((sum, e) => sum + e.points, 0);
};
const balance = async (s) => (await User.findById(s.customer._id)).loyaltyPoints;
const owed = async (s) => (await User.findById(s.customer._id)).loyaltyPointsOwed || 0;
const lotLeft = async (lot) => (await LoyaltyLot.findById(lot._id)).remainingPoints;

describe("LY-01: a refunded return gives back its share of the redeemed points", () => {
  it("T1 full return of a one-item order: all redeemed points back into their batch, same expiry", async () => {
    const s = await setup({ lines: [{ price: 1500 }] });
    expect(await balance(s)).toBe(0);
    const rr = await refundReturn(s, 0);

    expect(await restoredTotal(s)).toBe(150);
    expect(await balance(s)).toBe(150);
    expect(await lotLeft(s.lots[0])).toBe(150);
    const lot = await LoyaltyLot.findById(s.lots[0]._id);
    expect(lot.expiresAt.getTime()).toBe(s.lots[0].expiresAt.getTime());
    const entry = await LoyaltyTransaction.findOne({ order: s.order._id, type: "refunded" });
    expect(String(entry.returnRequest)).toBe(String(rr._id));
    expect(entry.source).toBe("order");
    expect(await LoyaltyLot.countDocuments({ user: s.customer._id })).toBe(1);
  });

  it("T2 partial return: the returned item's share, rounded down", async () => {
    const s = await setup({ lines: [{ price: 1005 }, { price: 500 }], lots: [{ points: 143, days: 300 }], redeem: 143 });
    await refundReturn(s, 1);
    // floor(143 x 500 / 1505) = floor(47.5) = 47
    expect(await restoredTotal(s)).toBe(47);
    expect(await balance(s)).toBe(47);
  });

  it("T3 several partial returns add up to exactly pointsRedeemed", async () => {
    const s = await setup({ lines: [{ price: 1005 }, { price: 500 }], lots: [{ points: 143, days: 300 }], redeem: 143 });
    await refundReturn(s, 1);
    await refundReturn(s, 0);
    expect(await restoredTotal(s)).toBe(143);
    expect(await balance(s)).toBe(143);
  });

  it("T4 a quantity-2 line returned one piece at a time", async () => {
    const s = await setup({ lines: [{ price: 600, quantity: 2 }, { price: 300 }] });
    await refundReturn(s, 0);
    expect(await restoredTotal(s)).toBe(60); // 150 x 600 / 1500
    await refundReturn(s, 0);
    expect(await restoredTotal(s)).toBe(120);
    await refundReturn(s, 1);
    expect(await restoredTotal(s)).toBe(150);
  });

  it("T5 D1: points of a batch that has expired come back and expire again at once", async () => {
    const s = await setup({ lines: [{ price: 1500 }] });
    await LoyaltyLot.updateOne({ _id: s.lots[0]._id }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    await expireDueLots();

    await refundReturn(s, 0);
    expect(await restoredTotal(s)).toBe(150);
    const expiredAgain = await LoyaltyTransaction.findOne({ order: s.order._id, type: "expired" });
    expect(expiredAgain?.points).toBe(-150);
    expect(await balance(s)).toBe(0);
    expect((await LoyaltyLot.findById(s.lots[0]._id)).expiredPoints).toBe(150);
  });

  it("T5b D1: a batch past its expiry the expiry job has not reached yet — expired at once, never spendable", async () => {
    const s = await setup({ lines: [{ price: 1500 }] });
    // Past expiry, but expireDueLots has NOT run: the lot still says "available".
    await LoyaltyLot.updateOne({ _id: s.lots[0]._id }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    expect((await LoyaltyLot.findById(s.lots[0]._id)).status).toBe("available");

    await refundReturn(s, 0);
    expect(await restoredTotal(s)).toBe(150);
    expect((await LoyaltyTransaction.findOne({ order: s.order._id, type: "expired" }))?.points).toBe(-150);
    expect(await balance(s)).toBe(0);
    const lot = await LoyaltyLot.findById(s.lots[0]._id);
    expect(lot.remainingPoints).toBe(0);
    expect(lot.expiredPoints).toBe(150);

    // The expiry job running later takes nothing more.
    await expireDueLots();
    expect(await balance(s)).toBe(0);
  });

  it("T5c D1 on cancellation too: a past-expiry batch the job has not reached is expired at once", async () => {
    const s = await setup({ lines: [{ price: 1500 }] });
    await LoyaltyLot.updateOne({ _id: s.lots[0]._id }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    expect((await cancelOrder(s)).status).toBe(200);
    expect(await restoredTotal(s)).toBe(150);
    expect(await balance(s)).toBe(0);
    expect((await LoyaltyLot.findById(s.lots[0]._id)).remainingPoints).toBe(0);
    await expireDueLots();
    expect(await balance(s)).toBe(0);
  });

  it("T6 D2: with two batches the latest expiry gets its points back first", async () => {
    // Redemption took 100 from the early batch (30 days) and 50 from the late one (300 days).
    const s = await setup({ lots: [{ points: 100, days: 30 }, { points: 100, days: 300 }] });
    const [early, late] = s.lots;
    expect(await lotLeft(early)).toBe(0);
    expect(await lotLeft(late)).toBe(50);

    await refundReturn(s, 1); // 50 back
    expect(await lotLeft(late)).toBe(100);
    expect(await lotLeft(early)).toBe(0);

    await refundReturn(s, 0); // remaining 100: the late batch is already whole
    expect(await lotLeft(late)).toBe(100);
    expect(await lotLeft(early)).toBe(100);
    expect(await restoredTotal(s)).toBe(150);
  });

  it("T7 D3a: restored before the earn clawback, so spent points do not turn into points owed", async () => {
    const s = await setup({
      lines: [{ price: 1500 }],
      overrides: { pointsEarned: 60, pointsCredited: true, loyaltyEarnBase: 1350 },
    });
    await applyLoyaltyPointsChange({
      userId: s.customer._id,
      type: "earned",
      source: "order",
      points: 60,
      key: `order:${s.order._id}`,
      order: s.order._id,
    });
    // The customer spends everything they have.
    await applyLoyaltyPointsChange({ userId: s.customer._id, type: "redeemed", source: "order", points: -60, key: "test:spent-all" });
    expect(await balance(s)).toBe(0);

    await refundReturn(s, 0);
    expect(await owed(s)).toBe(0);
    expect(await balance(s)).toBe(90); // +150 restored, -60 earn taken back
  });

  it("T8 D3b: restored points do not settle points owed from before", async () => {
    const s = await setup({ lines: [{ price: 1500 }] });
    await User.updateOne({ _id: s.customer._id }, { $set: { loyaltyPointsOwed: 30 } });
    await refundReturn(s, 0);
    expect(await owed(s)).toBe(30);
    expect(await balance(s)).toBe(150);
  });

  it("T9 D4: a redemption without batch records comes back as a new 365-day batch", async () => {
    const s = await setup({ lines: [{ price: 1000 }, { price: 500 }], lots: [], redeem: 100, legacyRedemption: true });
    const before = Date.now();
    await refundReturn(s, 1);

    // floor(100 x 500 / 1500) = 33
    expect(await restoredTotal(s)).toBe(33);
    const lot = await LoyaltyLot.findOne({ user: s.customer._id, source: "legacy_refund" });
    expect(lot?.originalPoints).toBe(33);
    expect(lot.expiresAt.getTime()).toBeGreaterThanOrEqual(lotExpiryFor(new Date(before)).getTime());
    expect(await balance(s)).toBe(33);

    await refundReturn(s, 0);
    expect(await restoredTotal(s)).toBe(100);
    expect(await balance(s)).toBe(100);
  });

  it("T10a the same return refunded twice at once: restored once", async () => {
    const s = await setup();
    const rr = await openReturn(s, 1);
    const results = await Promise.all([setReturnStatus(s, rr._id, "Refunded"), setReturnStatus(s, rr._id, "Refunded")]);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(await restoredTotal(s)).toBe(50);
    expect(await balance(s)).toBe(50);
  });

  it("T10b two returns of the same order refunded at once: total exactly pointsRedeemed", async () => {
    const s = await setup();
    const [a, b] = [await openReturn(s, 0), await openReturn(s, 1)];
    const results = await Promise.all([setReturnStatus(s, a._id, "Refunded"), setReturnStatus(s, b._id, "Refunded")]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await restoredTotal(s)).toBe(150);
    expect(await balance(s)).toBe(150);
  });

  it("T10c a return refunded while the order is cancelled: never more than pointsRedeemed", async () => {
    const s = await setup();
    const rr = await openReturn(s, 1);
    await Promise.all([setReturnStatus(s, rr._id, "Refunded"), cancelOrder(s)]);
    expect((await Order.findById(s.order._id)).orderStatus).toBe("Cancelled");
    expect(await restoredTotal(s)).toBe(150);
    expect(await balance(s)).toBe(150);
  });

  it("T11 partial return then cancellation: cancel gives back only the rest, into the right batches", async () => {
    const s = await setup({ lots: [{ points: 100, days: 30 }, { points: 100, days: 300 }] });
    const [early, late] = s.lots;
    await refundReturn(s, 1); // 50 back into the late batch
    expect(await restoredTotal(s)).toBe(50);

    expect((await cancelOrder(s)).status).toBe(200);
    expect(await restoredTotal(s)).toBe(150);
    // 200 credited, 150 redeemed, all 150 back.
    expect(await balance(s)).toBe(200);
    expect(await lotLeft(early)).toBe(100);
    expect(await lotLeft(late)).toBe(100);
  });

  it("T11b two partial returns then cancellation: total stays pointsRedeemed", async () => {
    const s = await setup({ lines: [{ price: 700 }, { price: 500 }, { price: 300 }] });
    await refundReturn(s, 1);
    await refundReturn(s, 2);
    expect(await restoredTotal(s)).toBe(80); // floor(150 x 800 / 1500)
    expect((await cancelOrder(s)).status).toBe(200);
    expect(await restoredTotal(s)).toBe(150);
    expect(await balance(s)).toBe(150);
  });

  it("T12 an order that redeemed nothing: no restore entry", async () => {
    const s = await setup({ lots: [], redeem: 0 });
    await refundReturn(s, 1);
    expect(await LoyaltyTransaction.countDocuments({ order: s.order._id, type: "refunded" })).toBe(0);
  });

  it("T13 only Refunded restores: Approved, Picked Up and Rejected give nothing back", async () => {
    const s = await setup();
    const picked = await openReturn(s, 0);
    expect((await setReturnStatus(s, picked._id, "Approved")).status).toBe(200);
    expect((await setReturnStatus(s, picked._id, "Picked Up")).status).toBe(200);
    const rejected = await openReturn(s, 1);
    expect((await setReturnStatus(s, rejected._id, "Rejected")).status).toBe(200);
    expect(await restoredTotal(s)).toBe(0);
    expect(await balance(s)).toBe(0);
  });

  it("T14 guard: the cash refund figure is unchanged", async () => {
    const s = await setup();
    await refundReturn(s, 1);
    const order = await Order.findById(s.order._id);
    expect(order.refundedAmount).toBe(450); // 500 x (1 - 150/1500)
    expect(order.refundedAmount).toBe(returnedValueFor(order, order.orderItems[1], 1));
  });

  it("T15 all or nothing: if the restore fails, the refund, clawback, stock and status roll back", async () => {
    const s = await setup({ lines: [{ price: 1500 }], overrides: { pointsEarned: 60, pointsCredited: true, loyaltyEarnBase: 1350 } });
    await applyLoyaltyPointsChange({
      userId: s.customer._id,
      type: "earned",
      source: "order",
      points: 60,
      key: `order:${s.order._id}`,
      order: s.order._id,
    });
    const rr = await openReturn(s, 0);
    const stockBefore = (await s.products[0].constructor.findById(s.products[0]._id)).stock;

    const realCreate = LoyaltyTransaction.create.bind(LoyaltyTransaction);
    vi.spyOn(LoyaltyTransaction, "create").mockImplementation((docs, ...rest) => {
      const list = Array.isArray(docs) ? docs : [docs];
      if (list.some((d) => d.type === "refunded")) throw new Error("simulated restore failure");
      return realCreate(docs, ...rest);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await setReturnStatus(s, rr._id, "Refunded");
    expect(res.status).toBe(500);
    vi.restoreAllMocks();

    const after = await ReturnRequest.findById(rr._id);
    expect(after.status).toBe("Requested");
    expect(after.pointsClawedBack).toBe(false);
    expect(after.stockRestored).toBe(false);
    const order = await Order.findById(s.order._id);
    expect(order.refundedAmount || 0).toBe(0);
    expect(order.pointsClawedBack || 0).toBe(0);
    expect((await s.products[0].constructor.findById(s.products[0]._id)).stock).toBe(stockBefore);
    expect(await LoyaltyTransaction.countDocuments({ order: s.order._id, type: { $in: ["refunded", "clawback"] } })).toBe(0);
    expect(await balance(s)).toBe(60);
  });
});
