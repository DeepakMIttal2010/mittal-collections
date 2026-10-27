import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { MongoServerError } from "mongodb";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// Transactions (and so real rollbacks) need a replica set.
import "./setup-replset.js";
import app from "../app.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Review from "../models/Review.js";
import ReturnRequest from "../models/ReturnRequest.js";
import Notification from "../models/Notification.js";
import SiteSettings from "../models/SiteSettings.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import {
  applyLoyaltyPointsChange,
  creditDueOrderPoints,
  eligibleEarnBase,
  expireDueLots,
  getLoyaltySummary,
  getSpendablePoints,
  lotExpiryFor,
  maxRedeemablePoints,
  pointsEarnedFor,
  refundRedeemedPoints,
} from "../utils/loyaltyPoints.js";
import { migrateLegacyBalances, planLegacyLots } from "../utils/loyaltyMigration.js";
import {
  createUser,
  signToken,
  createProduct,
  seedLoyaltySettings,
  seedReferralSettings,
  seedSiteSettings,
} from "./helpers.js";

const DAY = 24 * 60 * 60 * 1000;
const RULES = { earnRate: 20, redeemValue: 1, maxRedeemPercent: 0.1 };

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const placeOrder = async (token, items, extra = {}) => {
  const res = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({
      orderItems: items.map(({ product, quantity = 1 }) => ({
        product: product._id.toString(),
        name: product.name,
        price: product.price,
        quantity,
      })),
      shippingAddress,
      paymentMethod: "COD",
      ...extra,
    });

  return res;
};

const setStatus = (adminToken, orderId, status) =>
  request(app)
    .put(`/api/orders/${orderId}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status });

// An available lot credited at `creditedAt` (so it expires 365 days later).
const grant = (user, points, creditedAt = new Date()) =>
  applyLoyaltyPointsChange({
    userId: user._id,
    type: "admin_adjustment",
    source: "admin",
    points,
    key: `test-grant:${user._id}:${points}:${creditedAt.getTime()}:${Math.random()}`,
    description: "test grant",
    now: creditedAt,
  });

// Balance, lots and ledger must always agree.
const expectConsistent = async (userId) => {
  const user = await User.findById(userId);
  const lots = await LoyaltyLot.find({ user: userId, status: "available" });
  const ledger = await LoyaltyTransaction.find({ user: userId });
  const lotSum = lots.reduce((sum, lot) => sum + lot.remainingPoints, 0);
  const ledgerSum = ledger.reduce((sum, entry) => sum + entry.points, 0);
  expect(user.loyaltyPoints).toBeGreaterThanOrEqual(0);
  expect(user.loyaltyPoints).toBe(lotSum);
  expect(user.loyaltyPoints).toBe(ledgerSum);
  return user;
};

let admin;
let adminToken;

beforeEach(async () => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({});
  await seedLoyaltySettings(RULES);
  await seedReferralSettings({ referrerPoints: 100, referredPoints: 50 });
  await seedSiteSettings({ codCharge: 0, defaultReturnPeriodDays: 7 });
  admin = await createUser({ role: "admin" });
  adminToken = signToken(admin);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("earning", () => {
  it("floors ₹0/19/20/39/40 to 0/0/1/1/2 points", () => {
    expect([0, 19, 20, 39, 40].map((amount) => pointsEarnedFor(amount, 20))).toEqual([0, 0, 1, 1, 2]);
  });

  it("earns on merchandise after coupon, bundle and points discounts — never on delivery or COD", () => {
    const order = {
      orderItems: [{ price: 500, quantity: 2 }],
      discountAmount: 100,
      bundleDiscountAmount: 50,
      pointsDiscount: 30,
      deliveryFee: 49,
      codCharge: 50,
      totalPrice: 919,
    };
    expect(eligibleEarnBase(order)).toBe(820);
    expect(pointsEarnedFor(eligibleEarnBase(order), 20)).toBe(41);
  });

  it("keeps a delivered order's points pending (not spendable) until the return window closes", async () => {
    await SiteSettings.updateOne({}, { $set: { codCharge: 50 } });
    const user = await createUser();
    // ₹400 is below the free-shipping threshold: delivery fee + ₹50 COD are
    // charged but must not earn.
    const product = await createProduct({ price: 400, stock: 5 });
    const placed = await placeOrder(signToken(user), [{ product }]);
    expect(placed.body.order.deliveryFee).toBeGreaterThan(0);
    expect(placed.body.order.codCharge).toBe(50);

    await setStatus(adminToken, placed.body.order._id, "Delivered");

    const order = await Order.findById(placed.body.order._id);
    expect(order.pointsEarned).toBe(20); // 400 / 20, fees excluded
    expect(order.pointsCredited).toBe(false);
    expect(order.pointsAvailableAt.getTime() - order.deliveredAt.getTime()).toBe(7 * DAY);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);

    const summary = await getLoyaltySummary(user._id);
    expect(summary.available).toBe(0);
    expect(summary.pendingTotal).toBe(20);

    // Pending points can't be redeemed.
    const product2 = await createProduct({ price: 1000, stock: 5 });
    const second = await placeOrder(signToken(user), [{ product: product2 }], { redeemPoints: 20 });
    expect(second.body.order.pointsRedeemed).toBe(0);

    // Not yet: 1 minute before the window closes.
    expect((await creditDueOrderPoints({ now: new Date(order.pointsAvailableAt.getTime() - 60000) })).credited).toBe(0);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);

    const creditedAt = new Date(order.pointsAvailableAt.getTime() + 60000);
    expect((await creditDueOrderPoints({ now: creditedAt })).credited).toBe(1);

    const lot = await LoyaltyLot.findOne({ key: `order:${order._id}` });
    expect(lot.originalPoints).toBe(20);
    expect(lot.creditedAt.getTime()).toBe(creditedAt.getTime());
    expect(lot.expiresAt.getTime()).toBe(lotExpiryFor(creditedAt).getTime());
    await expectConsistent(user._id);

    // Rerunning the job credits nothing more.
    expect((await creditDueOrderPoints({ now: new Date(creditedAt.getTime() + DAY) })).credited).toBe(0);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(20);
  });

  it("uses the longest return window among the order's returnable items; non-returnable items don't wait", async () => {
    const user = await createUser();
    const longWindow = await createProduct({ price: 500, returnPeriodDays: 10 });
    const finalSale = await createProduct({ price: 500, isReturnable: false });

    const mixed = await placeOrder(signToken(user), [{ product: longWindow }, { product: finalSale }]);
    await setStatus(adminToken, mixed.body.order._id, "Delivered");
    const mixedOrder = await Order.findById(mixed.body.order._id);
    expect(mixedOrder.pointsAvailableAt.getTime() - mixedOrder.deliveredAt.getTime()).toBe(10 * DAY);

    const onlyFinal = await placeOrder(signToken(user), [{ product: finalSale }]);
    await setStatus(adminToken, onlyFinal.body.order._id, "Delivered");
    const finalOrder = await Order.findById(onlyFinal.body.order._id);
    expect(finalOrder.pointsAvailableAt.getTime()).toBe(finalOrder.deliveredAt.getTime());
  });

  it("doesn't restart the return window or re-earn when Delivered is saved again", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }]);
    await setStatus(adminToken, placed.body.order._id, "Delivered");
    const first = await Order.findById(placed.body.order._id);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await setStatus(adminToken, placed.body.order._id, "Delivered");
    const second = await Order.findById(placed.body.order._id);

    expect(second.deliveredAt.getTime()).toBe(first.deliveredAt.getTime());
    expect(second.pointsAvailableAt.getTime()).toBe(first.pointsAvailableAt.getTime());
    expect(second.pointsEarned).toBe(50);
  });

  it("never credits an order cancelled just before its points were due", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }]);
    await setStatus(adminToken, placed.body.order._id, "Delivered");
    await setStatus(adminToken, placed.body.order._id, "Cancelled");

    await creditDueOrderPoints({ now: new Date(Date.now() + 30 * DAY) });

    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);
    expect(await LoyaltyTransaction.countDocuments({ user: user._id })).toBe(0);
  });

  it("waits while a return is open, then credits only the kept share", async () => {
    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 500, stock: 10 });
    const placed = await placeOrder(token, [{ product, quantity: 2 }]);
    const orderId = placed.body.order._id;
    await setStatus(adminToken, orderId, "Delivered");

    const ret = await request(app)
      .post("/api/returns")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId, productId: product._id.toString(), quantity: 1, reason: "Too small" });
    expect(ret.status).toBe(201);

    const later = new Date(Date.now() + 8 * DAY);
    const waiting = await creditDueOrderPoints({ now: later });
    expect(waiting.waitingOnReturn).toBe(1);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);

    await request(app)
      .put(`/api/returns/${ret.body.returnRequest._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Refunded" });

    const order = await Order.findById(orderId);
    expect(order.pointsClawedBack).toBe(25); // half of 50 returned before credit

    await creditDueOrderPoints({ now: later });
    expect((await User.findById(user._id)).loyaltyPoints).toBe(25);
    await expectConsistent(user._id);
  });
});

describe("redemption", () => {
  it.each([1, 10, 49, 50, 51])("redeems all %i available points — there is no minimum", async (points) => {
    const user = await createUser();
    await grant(user, points);
    const product = await createProduct({ price: 1000 });

    const res = await placeOrder(signToken(user), [{ product }], { redeemPoints: points });

    expect(res.body.order.pointsRedeemed).toBe(points);
    expect(res.body.order.pointsDiscount).toBe(points); // ₹1 per point
    expect(res.body.order.totalPrice).toBe(1000 - points);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);
    await expectConsistent(user._id);
  });

  it.each([
    [500, 50],
    [1000, 100],
    [2000, 200],
  ])("caps redemption at 10%% of a ₹%i item total (%i points)", async (price, cap) => {
    const user = await createUser();
    await grant(user, 1000);
    const product = await createProduct({ price });

    const res = await placeOrder(signToken(user), [{ product }], { redeemPoints: 1000 });

    expect(res.body.order.pointsRedeemed).toBe(cap);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(1000 - cap);
  });

  it("applies the 10% cap to the item total after the coupon/bundle discounts, never to delivery or COD", () => {
    expect(maxRedeemablePoints(900, 1000, { maxRedeemPercent: 0.1, redeemValue: 1 })).toBe(90);
    expect(maxRedeemablePoints(0, 1000, { maxRedeemPercent: 0.1, redeemValue: 1 })).toBe(0);
    expect(maxRedeemablePoints(1000, 7, { maxRedeemPercent: 0.1, redeemValue: 1 })).toBe(7);
  });

  it("redeems only what's available when asked for more", async () => {
    const user = await createUser();
    await grant(user, 30);
    const product = await createProduct({ price: 1000 });

    const res = await placeOrder(signToken(user), [{ product }], { redeemPoints: 100 });
    expect(res.body.order.pointsRedeemed).toBe(30);
  });

  it("ignores tampered redeemPoints values", async () => {
    const user = await createUser();
    await grant(user, 100);
    const product = await createProduct({ price: 1000, stock: 20 });
    const token = signToken(user);

    for (const redeemPoints of [-50, "abc", { $gt: 0 }, 0]) {
      const res = await placeOrder(token, [{ product }], { redeemPoints });
      expect(res.body.order.pointsRedeemed).toBe(0);
    }

    const huge = await placeOrder(token, [{ product }], { redeemPoints: 1e9 });
    expect(huge.body.order.pointsRedeemed).toBe(100);
    expect(huge.body.order.totalPrice).toBe(900);
  });

  it("doesn't count a batch past its expiry, even before the expiry job has run", async () => {
    const user = await createUser();
    await grant(user, 40, new Date(Date.now() - 400 * DAY)); // expired
    await grant(user, 15);

    expect(await getSpendablePoints(user._id)).toBe(15);

    const product = await createProduct({ price: 1000 });
    const res = await placeOrder(signToken(user), [{ product }], { redeemPoints: 50 });
    expect(res.body.order.pointsRedeemed).toBe(15);
  });

  it("never lets two concurrent checkouts spend the same points", async () => {
    const user = await createUser();
    await grant(user, 100);
    const product = await createProduct({ price: 1000, stock: 20 });
    const token = signToken(user);

    const results = await Promise.all(
      [1, 2, 3].map(() => placeOrder(token, [{ product }], { redeemPoints: 100 })),
    );

    const live = await Order.find({ user: user._id, orderStatus: { $ne: "Cancelled" } });
    const spent = live.reduce((sum, order) => sum + order.pointsRedeemed, 0);
    expect(spent).toBeLessThanOrEqual(100);
    expect(results.some((r) => r.body.order?.pointsRedeemed === 100)).toBe(true);

    const finalUser = await expectConsistent(user._id);
    expect(finalUser.loyaltyPoints).toBe(100 - spent);
  });
});

describe("batches, FEFO and expiry", () => {
  it("expires each batch 365 days after its own IST credit day, end of that day", () => {
    expect(lotExpiryFor(new Date("2026-10-26T10:00:00+05:30")).toISOString()).toBe(
      new Date("2027-10-26T23:59:59.999+05:30").toISOString(),
    );
    // 01:30 IST on the 26th is still the 25th in UTC.
    expect(lotExpiryFor(new Date("2026-10-25T20:00:00Z")).toISOString()).toBe(
      new Date("2027-10-26T23:59:59.999+05:30").toISOString(),
    );
  });

  it("spends the earliest-expiring batch first and can split a batch", async () => {
    const user = await createUser();
    const older = (await grant(user, 20, new Date(Date.now() - 100 * DAY))).lot;
    const newer = (await grant(user, 50, new Date(Date.now() - 10 * DAY))).lot;
    const product = await createProduct({ price: 1000 });

    await placeOrder(signToken(user), [{ product }], { redeemPoints: 30 });

    expect((await LoyaltyLot.findById(older._id)).remainingPoints).toBe(0);
    expect((await LoyaltyLot.findById(newer._id)).remainingPoints).toBe(40);

    const redemption = await LoyaltyTransaction.findOne({ user: user._id, type: "redeemed" });
    expect(redemption.allocations.map((a) => [String(a.lot), a.points])).toEqual([
      [String(older._id), 20],
      [String(newer._id), 10],
    ]);
    await expectConsistent(user._id);
  });

  it("doesn't extend an older batch when new points arrive", async () => {
    const user = await createUser();
    const older = (await grant(user, 20, new Date(Date.now() - 100 * DAY))).lot;
    await grant(user, 30);
    expect((await LoyaltyLot.findById(older._id)).expiresAt.getTime()).toBe(older.expiresAt.getTime());
  });

  it("expires only the unspent remainder of the due batch, exactly at its boundary, once", async () => {
    const user = await createUser({ email: "expiry@example.com" });
    const older = (await grant(user, 20, new Date(Date.now() - 100 * DAY))).lot;
    const newer = (await grant(user, 50, new Date(Date.now() - 10 * DAY))).lot;
    const product = await createProduct({ price: 1000 });
    await placeOrder(signToken(user), [{ product }], { redeemPoints: 5 }); // 15 left in older

    const justBefore = new Date(older.expiresAt.getTime() - 1);
    expect((await expireDueLots({ now: justBefore })).expiredLots).toBe(0);

    const atBoundary = new Date(older.expiresAt.getTime());
    const first = await expireDueLots({ now: atBoundary });
    expect(first.expiredLots).toBe(1);

    const expired = await LoyaltyLot.findById(older._id);
    expect(expired.status).toBe("expired");
    expect(expired.expiredPoints).toBe(15);
    expect((await LoyaltyLot.findById(newer._id)).remainingPoints).toBe(50);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(50);

    const second = await expireDueLots({ now: atBoundary });
    expect(second.expiredLots).toBe(0);
    expect(await LoyaltyTransaction.countDocuments({ user: user._id, type: "expired" })).toBe(1);
    expect(await Notification.countDocuments({ user: user._id, title: /expired/ })).toBe(1);
    expect(sendEmail.mock.calls.filter(([mail]) => /expired/.test(mail.subject))).toHaveLength(1);
    await expectConsistent(user._id);
  });

  it("runs overlapping expiry jobs without expiring anything twice", async () => {
    const user = await createUser();
    await grant(user, 20, new Date(Date.now() - 400 * DAY));
    await grant(user, 20, new Date(Date.now() - 380 * DAY));
    await grant(user, 30);

    await Promise.all([expireDueLots(), expireDueLots(), expireDueLots()]);

    expect(await LoyaltyTransaction.countDocuments({ user: user._id, type: "expired" })).toBe(2);
    expect((await expectConsistent(user._id)).loyaltyPoints).toBe(30);
  });

  it("keeps expiry and a concurrent redemption from using the same points", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 2000 });
    const due = (await grant(user, 60, new Date(Date.now() - 365 * DAY - DAY))).lot;
    await grant(user, 100);
    // Make the due lot spendable for the redemption's read, expired for the job's.
    await LoyaltyLot.updateOne({ _id: due._id }, { $set: { expiresAt: new Date(Date.now() + 200) } });

    await Promise.all([
      placeOrder(signToken(user), [{ product }], { redeemPoints: 150 }),
      new Promise((resolve) => setTimeout(resolve, 250)).then(() => expireDueLots()),
    ]);

    const lot = await LoyaltyLot.findById(due._id);
    const redeemed = await LoyaltyTransaction.findOne({ user: user._id, type: "redeemed" });
    const fromDueLot = (redeemed?.allocations || [])
      .filter((a) => String(a.lot) === String(due._id))
      .reduce((sum, a) => sum + a.points, 0);
    expect(fromDueLot + lot.expiredPoints + lot.remainingPoints).toBe(60);
    await expectConsistent(user._id);
  });

  it("refunds cancelled-order points into their original batches, keeping their expiry", async () => {
    const user = await createUser();
    const lot = (await grant(user, 80, new Date(Date.now() - 50 * DAY))).lot;
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }], { redeemPoints: 60 });

    await setStatus(adminToken, placed.body.order._id, "Cancelled");

    expect((await LoyaltyLot.findById(lot._id)).remainingPoints).toBe(80);
    expect(await LoyaltyLot.countDocuments({ user: user._id })).toBe(1);
    expect((await expectConsistent(user._id)).loyaltyPoints).toBe(80);

    // A second refund attempt does nothing.
    const again = await refundRedeemedPoints({ order: await Order.findById(placed.body.order._id) });
    expect(again.duplicate).toBe(true);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(80);
  });

  it("refunds points whose batch already expired and expires them again straight away", async () => {
    const user = await createUser();
    const lot = (await grant(user, 80, new Date(Date.now() - 300 * DAY))).lot;
    await grant(user, 10);
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }], { redeemPoints: 50 });

    await expireDueLots({ now: new Date(lot.expiresAt.getTime() + 1000) });
    expect((await LoyaltyLot.findById(lot._id)).expiredPoints).toBe(30);

    await setStatus(adminToken, placed.body.order._id, "Cancelled");

    const refund = await LoyaltyTransaction.findOne({ user: user._id, type: "refunded" });
    expect(refund.points).toBe(50);
    const reExpired = await LoyaltyTransaction.findOne({ key: `refund:order:${placed.body.order._id}:expired` });
    expect(reExpired.points).toBe(-50);
    expect((await LoyaltyLot.findById(lot._id)).expiredPoints).toBe(80);
    expect((await expectConsistent(user._id)).loyaltyPoints).toBe(10);
  });
});

describe("cancellations, returns and owed points", () => {
  const deliverAndCredit = async (user, price = 1000, quantity = 1) => {
    const product = await createProduct({ price, stock: 10 });
    const placed = await placeOrder(signToken(user), [{ product, quantity }]);
    await setStatus(adminToken, placed.body.order._id, "Delivered");
    await creditDueOrderPoints({ now: new Date(Date.now() + 8 * DAY) });
    return { product, orderId: placed.body.order._id };
  };

  it("takes back credited points from the order's own batch when the order is cancelled later", async () => {
    const user = await createUser();
    await grant(user, 10, new Date(Date.now() - 200 * DAY));
    const { orderId } = await deliverAndCredit(user);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(60);

    await setStatus(adminToken, orderId, "Cancelled");

    const orderLot = await LoyaltyLot.findOne({ key: `order:${orderId}` });
    expect(orderLot.remainingPoints).toBe(0);
    expect((await expectConsistent(user._id)).loyaltyPoints).toBe(10);
  });

  it("records points already spent as owed, and settles them from the next credit", async () => {
    const user = await createUser();
    const { orderId } = await deliverAndCredit(user); // 50 credited
    const spendOn = await createProduct({ price: 1000, stock: 5 });
    await placeOrder(signToken(user), [{ product: spendOn }], { redeemPoints: 40 }); // 10 left

    await setStatus(adminToken, orderId, "Cancelled");

    let reloaded = await User.findById(user._id);
    expect(reloaded.loyaltyPoints).toBe(0);
    expect(reloaded.loyaltyPointsOwed).toBe(40);
    const clawback = await LoyaltyTransaction.findOne({ key: `order-reversal:${orderId}` });
    expect(clawback.points).toBe(-10);
    expect(clawback.shortfall).toBe(40);

    await grant(user, 100);
    reloaded = await User.findById(user._id);
    expect(reloaded.loyaltyPoints).toBe(60);
    expect(reloaded.loyaltyPointsOwed).toBe(0);
    expect(await LoyaltyTransaction.countDocuments({ user: user._id, type: "debt_recovered" })).toBe(1);
    await expectConsistent(user._id);
  });

  it("claws back proportionally across several partial returns, capped at what was earned, once each", async () => {
    const user = await createUser();
    const { product, orderId } = await deliverAndCredit(user, 300, 3); // ₹900 -> 45 points
    expect((await User.findById(user._id)).loyaltyPoints).toBe(45);

    // Returns after crediting (returns are normally opened inside the
    // window; this exercises the post-credit path directly).
    const makeReturn = (quantity) =>
      ReturnRequest.create({
        order: orderId,
        user: user._id,
        product: product._id,
        productName: product.name,
        quantity,
        reason: "test",
        size: "",
      });
    const refund = (id) =>
      request(app)
        .put(`/api/returns/${id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "Refunded" });

    const first = await makeReturn(1);
    await refund(first._id);
    await refund(first._id); // duplicate processing
    expect((await User.findById(user._id)).loyaltyPoints).toBe(30); // keep floor(45*600/900)=30

    await ReturnRequest.updateOne({ _id: first._id }, { $set: { size: "done" } });
    const second = await makeReturn(2);
    await refund(second._id);

    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);
    expect((await Order.findById(orderId)).pointsClawedBack).toBe(45);
    expect(await LoyaltyTransaction.countDocuments({ user: user._id, type: "clawback" })).toBe(2);
    await expectConsistent(user._id);
  });
});

describe("referral, review, POS and admin rewards", () => {
  it("pays the referral bonus once, after the window, even when two orders settle at once", async () => {
    const referrer = await createUser();
    const referred = await createUser({ referredBy: referrer._id });
    const token = signToken(referred);
    const product = await createProduct({ price: 1000, stock: 10 });

    for (let i = 0; i < 2; i += 1) {
      const placed = await placeOrder(token, [{ product }]);
      await setStatus(adminToken, placed.body.order._id, "Delivered");
    }
    expect((await User.findById(referrer._id)).loyaltyPoints).toBe(0); // not on delivery

    const later = new Date(Date.now() + 8 * DAY);
    await Promise.all([creditDueOrderPoints({ now: later }), creditDueOrderPoints({ now: later })]);

    expect((await User.findById(referrer._id)).loyaltyPoints).toBe(100);
    expect((await User.findById(referred._id)).loyaltyPoints).toBe(150); // 2 x 50 + 50
    expect(await Order.countDocuments({ user: referred._id, referralBonusPaid: true })).toBe(1);
    const bonusLot = await LoyaltyLot.findOne({ user: referrer._id, source: "referral" });
    expect(bonusLot.expiresAt.getTime()).toBe(lotExpiryFor(later).getTime());
  });

  it("reverses the referral bonus when the order that earned it is cancelled", async () => {
    const referrer = await createUser();
    const referred = await createUser({ referredBy: referrer._id });
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(referred), [{ product }]);
    await setStatus(adminToken, placed.body.order._id, "Delivered");
    await creditDueOrderPoints({ now: new Date(Date.now() + 8 * DAY) });

    await setStatus(adminToken, placed.body.order._id, "Cancelled");

    expect((await expectConsistent(referrer._id)).loyaltyPoints).toBe(0);
    const referredAfter = await expectConsistent(referred._id);
    expect(referredAfter.loyaltyPoints).toBe(0);
    expect(referredAfter.referralRewarded).toBe(false);
  });

  it("caps review bonuses at 50 per order, never pays one twice, and reverses on removal", async () => {
    const user = await createUser();
    const products = [await createProduct(), await createProduct()];
    const order = await Order.create({
      user: user._id,
      orderItems: products.map((p) => ({ product: p._id, name: p.name, price: p.price, quantity: 1 })),
      shippingAddress,
      totalPrice: 1998,
      orderStatus: "Delivered",
      deliveredAt: new Date(),
    });
    const reviews = await Promise.all(
      products.map((p) =>
        Review.create({ user: user._id, product: p._id, order: order._id, rating: 5, content: "Great" }),
      ),
    );
    const approve = (id) =>
      request(app).put(`/api/reviews/${id}/approve`).set("Authorization", `Bearer ${adminToken}`);

    await Promise.all([approve(reviews[0]._id), approve(reviews[1]._id), approve(reviews[0]._id)]);

    let reloaded = await expectConsistent(user._id);
    expect(reloaded.loyaltyPoints).toBe(50);
    const reviewLot = await LoyaltyLot.findOne({ user: user._id, source: "review" });
    expect(reviewLot.originalPoints).toBe(50);

    const awarded = await Review.findOne({ pointsAwarded: 50 });
    await request(app).delete(`/api/reviews/${awarded._id}`).set("Authorization", `Bearer ${adminToken}`);

    reloaded = await expectConsistent(user._id);
    expect(reloaded.loyaltyPoints).toBe(0);
    expect((await Order.findById(order._id)).reviewBonusAwarded).toBe(0);
  });

  it("credits in-store points at the sale and reverses them correctly on edit, void and delete", async () => {
    const customer = await createUser({ mobile: "9876500001" });
    const product = await createProduct({ price: 100, stock: 50 });
    const sale = (method, url, items) => {
      const req = request(app)[method](url).set("Authorization", `Bearer ${adminToken}`);
      req.field("items", JSON.stringify(items));
      req.field("paymentMethod", "Cash");
      req.field("customerMobile", "9876500001");
      return req;
    };
    const item = (quantity) => [{ productId: product._id.toString(), quantity, unitPrice: 100 }];

    const created = await sale("post", "/api/admin/pos/sale", item(4)); // ₹400 -> 20
    expect(created.status).toBe(201);
    expect((await User.findById(customer._id)).loyaltyPoints).toBe(20);

    const id = created.body.sale._id;
    await sale("put", `/api/admin/pos/sales/${id}`, item(6)); // ₹600 -> 30
    expect((await expectConsistent(customer._id)).loyaltyPoints).toBe(30);

    await request(app).post(`/api/admin/pos/sales/${id}/void`).set("Authorization", `Bearer ${adminToken}`).send({});
    await request(app).post(`/api/admin/pos/sales/${id}/void`).set("Authorization", `Bearer ${adminToken}`).send({});
    expect((await expectConsistent(customer._id)).loyaltyPoints).toBe(0);

    const other = await sale("post", "/api/admin/pos/sale", item(2));
    await request(app).delete(`/api/admin/pos/sales/${other.body.sale._id}`).set("Authorization", `Bearer ${adminToken}`);
    expect((await expectConsistent(customer._id)).loyaltyPoints).toBe(0);
  });

  it("requires a reason for admin adjustments, blocks over-deduction, and logs who did it", async () => {
    const customer = await createUser();
    const adjust = (body) =>
      request(app)
        .put(`/api/admin/customers/${customer._id}/loyalty-adjust`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body);

    expect((await adjust({ points: 25 })).status).toBe(400);

    const granted = await adjust({ points: 25, reason: "Goodwill" });
    expect(granted.status).toBe(200);
    expect(granted.body.transaction.actor.name).toBe(admin.name);
    expect(granted.body.transaction.expiresAt).toBeTruthy();

    expect((await adjust({ points: -30, reason: "Too many" })).status).toBe(400);
    expect((await adjust({ points: -5, reason: "Correction" })).status).toBe(200);
    expect((await expectConsistent(customer._id)).loyaltyPoints).toBe(20);

    const customerToken = signToken(customer);
    expect(
      (
        await request(app)
          .put(`/api/admin/customers/${customer._id}/loyalty-adjust`)
          .set("Authorization", `Bearer ${customerToken}`)
          .send({ points: 1000, reason: "self" })
      ).status,
    ).toBe(403);
  });
});

describe("transactions and idempotency", () => {
  it("rolls back the lot and balance when the ledger insert fails", async () => {
    const user = await createUser();
    vi.spyOn(LoyaltyTransaction, "create").mockRejectedValueOnce(new Error("ledger down"));

    await expect(grant(user, 30)).rejects.toThrow("ledger down");

    expect(await LoyaltyLot.countDocuments({ user: user._id })).toBe(0);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);
  });

  it("rolls back the lot allocation when the balance update fails", async () => {
    const user = await createUser();
    const lot = (await grant(user, 30)).lot;
    vi.spyOn(User, "findOneAndUpdate").mockRejectedValueOnce(new Error("balance write failed"));

    await expect(
      applyLoyaltyPointsChange({ userId: user._id, type: "redeemed", points: -10, key: "rb-1" }),
    ).rejects.toThrow("balance write failed");

    expect((await LoyaltyLot.findById(lot._id)).remainingPoints).toBe(30);
    await expectConsistent(user._id);
  });

  it("rolls back the balance when a lot update fails", async () => {
    const user = await createUser();
    await grant(user, 30);
    vi.spyOn(LoyaltyLot, "updateOne").mockRejectedValueOnce(new Error("lot write failed"));

    await expect(
      applyLoyaltyPointsChange({ userId: user._id, type: "redeemed", points: -10, key: "rb-2" }),
    ).rejects.toThrow("lot write failed");

    expect((await User.findById(user._id)).loyaltyPoints).toBe(30);
    await expectConsistent(user._id);
  });

  it("retries a transient transaction error without crediting twice or notifying twice", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }]);
    await setStatus(adminToken, placed.body.order._id, "Delivered");
    await Notification.deleteMany({});

    const transient = new MongoServerError({ message: "simulated write conflict" });
    transient.addErrorLabel("TransientTransactionError");
    const realCreate = LoyaltyLot.create.bind(LoyaltyLot);
    vi.spyOn(LoyaltyLot, "create")
      .mockImplementationOnce(async (...args) => {
        await realCreate(...args);
        throw transient;
      })
      .mockImplementation(realCreate);

    await creditDueOrderPoints({ now: new Date(Date.now() + 8 * DAY) });

    expect(await LoyaltyLot.countDocuments({ user: user._id })).toBe(1);
    expect(await LoyaltyTransaction.countDocuments({ user: user._id })).toBe(1);
    expect(await Notification.countDocuments({ user: user._id })).toBe(1);
    expect((await expectConsistent(user._id)).loyaltyPoints).toBe(50);
  });

  it("treats a repeated idempotency key as already applied", async () => {
    const user = await createUser();
    const change = { userId: user._id, type: "earned", source: "admin", points: 10, key: "same-key" };
    await applyLoyaltyPointsChange(change);
    const again = await applyLoyaltyPointsChange(change);
    expect(again.duplicate).toBe(true);
    expect((await expectConsistent(user._id)).loyaltyPoints).toBe(10);
  });
});

describe("legacy migration", () => {
  it("rebuilds batches from real ledger dates and puts the unexplained rest in one legacy batch", () => {
    const migrationDate = new Date("2026-11-01T06:00:00Z");
    const plan = planLegacyLots({
      unbatched: 120,
      migrationDate,
      legacyEntries: [
        { points: 50, createdAt: new Date("2026-08-01T06:00:00Z") },
        { points: 40, createdAt: new Date("2026-09-01T06:00:00Z") },
        { points: -30, createdAt: new Date("2026-09-10T06:00:00Z") },
      ],
    });

    expect(plan.lots.map((lot) => lot.points)).toEqual([20, 40, 60]);
    expect(plan.lots[0].expiresAt.toISOString()).toBe(lotExpiryFor(new Date("2026-08-01T06:00:00Z")).toISOString());
    expect(plan.lots[2].residual).toBe(true);
    expect(plan.lots[2].expiresAt.toISOString()).toBe(lotExpiryFor(migrationDate).toISOString());
  });

  it("drops history already spent and never expires a legacy batch by migrating it", () => {
    const migrationDate = new Date("2027-12-01T06:00:00Z");
    const plan = planLegacyLots({
      unbatched: 30,
      migrationDate,
      legacyEntries: [
        { points: 50, createdAt: new Date("2026-08-01T06:00:00Z") },
        { points: 40, createdAt: new Date("2027-09-01T06:00:00Z") },
      ],
    });

    expect(plan.dropped).toBe(60);
    expect(plan.lots).toHaveLength(1);
    expect(plan.lots[0].points).toBe(30);
    expect(plan.lots[0].expiresAt > migrationDate).toBe(true);
  });

  it("dry-runs without writing, applies, preserves every balance and reruns as a no-op", async () => {
    const legacy = await createUser({ loyaltyPoints: 70 });
    await LoyaltyTransaction.create([
      { user: legacy._id, type: "earned", points: 50, balanceAfter: 50, createdAt: new Date(Date.now() - 60 * DAY) },
      { user: legacy._id, type: "earned", points: 20, balanceAfter: 70, createdAt: new Date(Date.now() - 20 * DAY) },
    ]);
    const mixed = await createUser({ loyaltyPoints: 15 }); // no ledger at all
    const modern = await createUser();
    await grant(modern, 40);

    const dryRun = await migrateLegacyBalances();
    expect(dryRun.totals.usersToMigrate).toBe(2);
    expect(dryRun.totals.unbatchedTotal).toBe(85);
    expect(await LoyaltyLot.countDocuments({ source: "legacy" })).toBe(0);

    const applied = await migrateLegacyBalances({ apply: true });
    expect(applied.totals.lotsCreated).toBe(3);

    for (const user of [legacy, mixed, modern]) {
      const before = user._id.equals(modern._id) ? 40 : user.loyaltyPoints;
      const lots = await LoyaltyLot.find({ user: user._id, status: "available" });
      expect((await User.findById(user._id)).loyaltyPoints).toBe(before);
      expect(lots.reduce((sum, lot) => sum + lot.remainingPoints, 0)).toBe(before);
    }

    const rerun = await migrateLegacyBalances({ apply: true });
    expect(rerun.totals.usersToMigrate).toBe(0);
    expect(rerun.totals.lotsCreated).toBe(0);
  });

  it("lets a not-yet-migrated balance be spent (oldest first) and refunded", async () => {
    const user = await createUser({ loyaltyPoints: 60 });
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }], { redeemPoints: 60 });
    expect(placed.body.order.pointsRedeemed).toBe(60);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);

    await setStatus(adminToken, placed.body.order._id, "Cancelled");
    expect((await User.findById(user._id)).loyaltyPoints).toBe(60);
  });
});

// Owner decision 2026-10-27: owed points are settled only from new credits
// (order earn, referral, review, POS, admin grant) — a refund puts redeemed
// points back into their batches and never touches the debt.
describe("owed points settlement on every credit path", () => {
  const recovered = async (userId) =>
    (await LoyaltyTransaction.find({ user: userId, type: "debt_recovered" })).reduce(
      (sum, entry) => sum - entry.points,
      0,
    );

  it("settles owed points from an order's credited earn", async () => {
    const user = await createUser({ loyaltyPointsOwed: 30 });
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }]);
    await setStatus(adminToken, placed.body.order._id, "Delivered");

    await creditDueOrderPoints({ now: new Date(Date.now() + 8 * DAY) });

    const reloaded = await expectConsistent(user._id);
    expect(reloaded.loyaltyPoints).toBe(20); // 50 earned - 30 owed
    expect(reloaded.loyaltyPointsOwed).toBe(0);
    expect(await recovered(user._id)).toBe(30);
    const lot = await LoyaltyLot.findOne({ key: `order:${placed.body.order._id}` });
    expect([lot.originalPoints, lot.remainingPoints]).toEqual([50, 20]);
  });

  it("settles owed points from a referral bonus, and only what the bonus covers", async () => {
    const referrer = await createUser({ loyaltyPointsOwed: 120 });
    const referred = await createUser({ referredBy: referrer._id });
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(referred), [{ product }]);
    await setStatus(adminToken, placed.body.order._id, "Delivered");

    await creditDueOrderPoints({ now: new Date(Date.now() + 8 * DAY) });

    const reloadedReferrer = await expectConsistent(referrer._id);
    expect(reloadedReferrer.loyaltyPoints).toBe(0);
    expect(reloadedReferrer.loyaltyPointsOwed).toBe(20); // 120 - 100
    expect(await recovered(referrer._id)).toBe(100);
    expect((await expectConsistent(referred._id)).loyaltyPoints).toBe(100); // 50 earn + 50 bonus
  });

  it("settles owed points from a review bonus", async () => {
    const user = await createUser({ loyaltyPointsOwed: 20 });
    const product = await createProduct();
    const order = await Order.create({
      user: user._id,
      orderItems: [{ product: product._id, name: product.name, price: product.price, quantity: 1 }],
      shippingAddress,
      totalPrice: product.price,
      orderStatus: "Delivered",
      deliveredAt: new Date(),
    });
    const review = await Review.create({ user: user._id, product: product._id, order: order._id, rating: 5, content: "Nice" });

    await request(app).put(`/api/reviews/${review._id}/approve`).set("Authorization", `Bearer ${adminToken}`);

    const reloaded = await expectConsistent(user._id);
    expect(reloaded.loyaltyPoints).toBe(30);
    expect(reloaded.loyaltyPointsOwed).toBe(0);
    expect(await recovered(user._id)).toBe(20);
  });

  it("settles owed points from an in-store purchase", async () => {
    const customer = await createUser({ mobile: "9876500099", loyaltyPointsOwed: 10 });
    const product = await createProduct({ price: 100, stock: 10 });

    const sale = await request(app)
      .post("/api/admin/pos/sale")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("items", JSON.stringify([{ productId: product._id.toString(), quantity: 4, unitPrice: 100 }]))
      .field("paymentMethod", "Cash")
      .field("customerMobile", "9876500099");
    expect(sale.status).toBe(201);

    const reloaded = await expectConsistent(customer._id);
    expect(reloaded.loyaltyPoints).toBe(10); // 20 earned - 10 owed
    expect(reloaded.loyaltyPointsOwed).toBe(0);
    expect(await recovered(customer._id)).toBe(10);
  });

  it("does not settle owed points from a refund of redeemed points", async () => {
    const user = await createUser();
    const lot = (await grant(user, 50)).lot;
    const product = await createProduct({ price: 1000 });
    const placed = await placeOrder(signToken(user), [{ product }], { redeemPoints: 50 });
    expect(placed.body.order.pointsRedeemed).toBe(50);
    await User.updateOne({ _id: user._id }, { $set: { loyaltyPointsOwed: 20 } });

    await setStatus(adminToken, placed.body.order._id, "Cancelled");

    const reloaded = await expectConsistent(user._id);
    expect(reloaded.loyaltyPoints).toBe(50);
    expect(reloaded.loyaltyPointsOwed).toBe(20);
    expect(await recovered(user._id)).toBe(0);
    expect((await LoyaltyLot.findById(lot._id)).remainingPoints).toBe(50);
  });

  it("settles each owed point exactly once when two credits land at the same time", async () => {
    const user = await createUser({ loyaltyPointsOwed: 40 });

    await Promise.all([grant(user, 30), grant(user, 30)]);

    const reloaded = await expectConsistent(user._id);
    expect(reloaded.loyaltyPoints).toBe(20);
    expect(reloaded.loyaltyPointsOwed).toBe(0);
    expect(await recovered(user._id)).toBe(40);
  });
});
