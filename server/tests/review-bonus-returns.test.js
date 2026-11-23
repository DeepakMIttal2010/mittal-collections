import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  return { sendEmail: vi.fn() };
});
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// A real (single-member) replica set: approval, grant, the return refund,
// the order cancellation and the reversals all run in real transactions,
// so the races below are real ones.
import "./setup-replset.js";
import app from "../app.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Review from "../models/Review.js";
import ReturnRequest from "../models/ReturnRequest.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { applyLoyaltyPointsChange, expireDueLots } from "../utils/loyaltyPoints.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import Role from "../models/Role.js";
import { createUser, signToken, createProduct, createOrder, seedSiteSettings } from "./helpers.js";
import { REVIEW_BONUS_POINTS, ORDER_REVIEW_BONUS_CAP } from "../controllers/reviewController.js";

const REASON = "Same photos posted from three different accounts";

beforeEach(async () => {
  sendEmail.mockReset().mockResolvedValue(undefined);
  await seedSiteSettings({ codCharge: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A delivered order of `quantity` units of one product (plus any extra
// products, one unit each) and the customer's still-unapproved review.
const setup = async ({ quantity = 1, orderOverrides = {}, extraProducts = 0 } = {}) => {
  const customer = await createUser();
  const admin = await createUser({ role: "admin" });
  const product = await createProduct({ stock: 10 });
  const extras = [];
  for (let i = 0; i < extraProducts; i += 1) extras.push(await createProduct({ stock: 10 }));

  const order = await createOrder({
    user: customer,
    products: [product, ...extras],
    overrides: { deliveredAt: new Date(), ...orderOverrides },
  });
  if (quantity !== 1) {
    order.orderItems[0].quantity = quantity;
    order.totalPrice = product.price * quantity + extras.reduce((sum, p) => sum + p.price, 0);
    await order.save();
  }

  const review = await makeReview(customer, product, order);

  return { customer, admin, adminToken: signToken(admin), product, extras, order, review };
};

const makeReview = (customer, product, order) =>
  Review.create({
    product: product._id,
    user: customer._id,
    order: order._id,
    rating: 5,
    content: "Lovely bedsheet, colours as shown",
  });

const openReturn = (s, { quantity = 1, status = "Requested" } = {}) =>
  ReturnRequest.create({
    order: s.order._id,
    user: s.customer._id,
    product: s.product._id,
    productName: s.product.name,
    quantity,
    reason: "Didn't like it",
    status,
  });

const approve = (s) =>
  request(app).put(`/api/reviews/${s.review._id}/approve`).set("Authorization", `Bearer ${s.adminToken}`);

const grant = (s) =>
  request(app).post(`/api/reviews/${s.review._id}/grant-bonus`).set("Authorization", `Bearer ${s.adminToken}`);

const reverse = (s) =>
  request(app)
    .post(`/api/reviews/${s.review._id}/reverse-bonus`)
    .set("Authorization", `Bearer ${s.adminToken}`)
    .send({ reason: REASON });

const setReturnStatus = (s, returnId, status) =>
  request(app)
    .put(`/api/returns/${returnId}/status`)
    .set("Authorization", `Bearer ${s.adminToken}`)
    .send({ status });

const setOrderStatus = (s, status) =>
  request(app)
    .put(`/api/orders/${s.order._id}/status`)
    .set("Authorization", `Bearer ${s.adminToken}`)
    .send({ status });

const deleteOrder = (s) =>
  request(app).delete(`/api/orders/${s.order._id}`).set("Authorization", `Bearer ${s.adminToken}`);

const balance = async (userId) => {
  const user = await User.findById(userId).select("loyaltyPoints loyaltyPointsOwed");
  return { points: user.loyaltyPoints, owed: user.loyaltyPointsOwed || 0 };
};

const bonusEntries = (reviewId) => LoyaltyTransaction.find({ review: reviewId, type: "earned" });
const reversalEntries = (reviewId) => LoyaltyTransaction.find({ review: reviewId, type: "clawback" });
const savedReview = (reviewId) => Review.findById(reviewId).select("+bonusHold +bonusReversal");
const capUsed = async (orderId) => (await Order.findById(orderId)).reviewBonusAwarded || 0;

const extraCredit = (userId, points = 100) =>
  applyLoyaltyPointsChange({
    userId,
    type: "admin_adjustment",
    source: "admin",
    points,
    key: `test:extra-${userId}`,
  });

// Approved and paid, then the whole quantity sent back (return still open).
const paidThenFullReturn = async (options) => {
  const s = await setup(options);
  expect((await approve(s)).status).toBe(200);
  expect(await balance(s.customer._id)).toEqual({ points: REVIEW_BONUS_POINTS, owed: 0 });
  const rr = await openReturn(s, { quantity: options?.quantity || 1 });
  return { ...s, rr };
};

const expectHeld = async (s, reason) => {
  const saved = await savedReview(s.review._id);
  expect(saved.isApproved).toBe(true);
  expect(saved.pointsAwarded).toBe(0);
  expect(saved.reviewPointsProcessed).toBe(false);
  expect(saved.bonusHold.reason).toBe(reason);
  expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 0 });
  expect(await bonusEntries(s.review._id)).toHaveLength(0);
  expect(await capUsed(s.order._id)).toBe(0);
};

const expectPaidOnce = async (s) => {
  expect(await balance(s.customer._id)).toEqual({ points: REVIEW_BONUS_POINTS, owed: 0 });
  const entries = await bonusEntries(s.review._id);
  expect(entries).toHaveLength(1);
  expect(entries[0].key).toBe(`review:${s.review._id}`);
  expect(await capUsed(s.order._id)).toBe(ORDER_REVIEW_BONUS_CAP);
  const saved = await savedReview(s.review._id);
  expect(saved.pointsAwarded).toBe(REVIEW_BONUS_POINTS);
  expect(saved.reviewPointsProcessed).toBe(true);
  expect(saved.bonusHold).toBeUndefined();
};

describe("Review bonus vs returns, cancellations and deleted orders", () => {
  for (const status of ["Requested", "Approved", "Picked Up"]) {
    it(`full return ${status}: approved and public, 0 points, bonus held, no cap used`, async () => {
      const s = await setup();
      await openReturn(s, { status });

      const res = await approve(s);

      expect(res.status).toBe(200);
      expect(res.body.bonusHold).toEqual({ reason: "return_in_progress" });
      await expectHeld(s, "return_in_progress");

      // Still shown publicly, without the hold.
      const pub = await request(app).get(`/api/reviews/product/${s.product._id}`);
      expect(pub.body.reviews).toHaveLength(1);
      expect(pub.text).not.toContain("bonusHold");
      expect(pub.text).not.toContain("return_in_progress");

      // The admin list shows the hold.
      const adminList = await request(app)
        .get("/api/reviews/admin")
        .set("Authorization", `Bearer ${s.adminToken}`);
      expect(adminList.body.reviews[0].bonusHold.reason).toBe("return_in_progress");
    });
  }

  it("approving a held review again pays nothing while the return is still open", async () => {
    const s = await setup();
    await openReturn(s);

    await approve(s);
    await approve(s);

    await expectHeld(s, "return_in_progress");
  });

  it("grant is refused (409) while the return is open, and after it was refunded", async () => {
    const s = await setup();
    const rr = await openReturn(s);
    await approve(s);

    const whileOpen = await grant(s);
    expect(whileOpen.status).toBe(409);
    expect(whileOpen.body.code).toBe("BONUS_STILL_HELD");

    expect((await setReturnStatus(s, rr._id, "Refunded")).status).toBe(200);
    const afterRefund = await grant(s);
    expect(afterRefund.status).toBe(409);
    expect(afterRefund.body.bonusHold).toEqual({ reason: "returned" });
    await expectHeld(s, "returned");
  });

  it("grant needs an approved review and an admin", async () => {
    const s = await setup();

    expect((await grant(s)).status).toBe(400);
    const asCustomer = await request(app)
      .post(`/api/reviews/${s.review._id}/grant-bonus`)
      .set("Authorization", `Bearer ${signToken(s.customer)}`);
    expect(asCustomer.status).toBe(403);
    expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 0 });
  });

  for (const status of ["Requested", "Approved"]) {
    it(`return ${status} at approval, then Rejected: Grant bonus twice in a row pays 50 exactly once`, async () => {
      const s = await setup();
      const rr = await openReturn(s, { status });
      await approve(s);
      await expectHeld(s, "return_in_progress");

      expect((await setReturnStatus(s, rr._id, "Rejected")).status).toBe(200);

      const first = await grant(s);
      const second = await grant(s);

      expect(first.status).toBe(200);
      expect(first.body.pointsAwarded).toBe(REVIEW_BONUS_POINTS);
      expect(second.status).toBe(409);
      await expectPaidOnce(s);
    });

    it(`return ${status} at approval, then Rejected: two simultaneous grants pay 50 exactly once`, async () => {
      const s = await setup();
      const rr = await openReturn(s, { status });
      await approve(s);
      expect((await setReturnStatus(s, rr._id, "Rejected")).status).toBe(200);

      const results = await Promise.all([grant(s), grant(s)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      await expectPaidOnce(s);
    });
  }

  it("a concurrent approve and grant on a released hold award once", async () => {
    const s = await setup();
    const rr = await openReturn(s);
    await approve(s);
    expect((await setReturnStatus(s, rr._id, "Rejected")).status).toBe(200);

    const [approved, granted] = await Promise.all([approve(s), grant(s)]);

    expect(approved.status).toBe(200);
    expect([200, 409]).toContain(granted.status);
    await expectPaidOnce(s);
  });

  it("approving twice (even concurrently) awards once", async () => {
    const s = await setup();

    await Promise.all([approve(s), approve(s)]);
    await approve(s);

    await expectPaidOnce(s);
  });

  it("partial return: paid at approval and kept when the partial return is refunded", async () => {
    const s = await setup({ quantity: 2 });
    const rr = await openReturn(s, { quantity: 1 });

    expect((await approve(s)).status).toBe(200);
    await expectPaidOnce(s);

    expect((await setReturnStatus(s, rr._id, "Refunded")).status).toBe(200);

    await expectPaidOnce(s);
    expect(await reversalEntries(s.review._id)).toHaveLength(0);
    expect((await savedReview(s.review._id)).bonusReversal).toBeUndefined();
  });

  it("full return refunded after payment: the bonus is reversed automatically, once", async () => {
    const s = await paidThenFullReturn({ quantity: 2 });
    await extraCredit(s.customer._id);

    expect((await setReturnStatus(s, s.rr._id, "Refunded")).status).toBe(200);
    // A retried Refunded is a no-op.
    await setReturnStatus(s, s.rr._id, "Refunded");

    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    const entries = await reversalEntries(s.review._id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: `review-reversal:${s.review._id}`,
      source: "review_bonus_reversal",
      points: -REVIEW_BONUS_POINTS,
    });

    const saved = await savedReview(s.review._id);
    expect(saved.bonusReversal).toMatchObject({
      reason: "Item returned",
      reversedBy: null,
      reversedByName: "System",
      points: REVIEW_BONUS_POINTS,
      pointsDebited: REVIEW_BONUS_POINTS,
      shortfall: 0,
    });
    // The cap stays used.
    expect(await capUsed(s.order._id)).toBe(ORDER_REVIEW_BONUS_CAP);
  });

  it("two sizes on one order: reversed only when the last kept size is refunded", async () => {
    const s = await setup({ extraProducts: 0 });
    // One unit each of sizes S and M of the same product.
    const line = s.order.orderItems[0].toObject();
    s.order.orderItems = [
      { ...line, size: "S" },
      { ...line, size: "M" },
    ];
    await s.order.save();
    await approve(s);
    await expectPaidOnce(s);

    const returnSize = (size) =>
      ReturnRequest.create({
        order: s.order._id,
        user: s.customer._id,
        product: s.product._id,
        productName: s.product.name,
        quantity: 1,
        size,
        reason: "Didn't like it",
      });

    const small = await returnSize("S");
    expect((await setReturnStatus(s, small._id, "Refunded")).status).toBe(200);
    expect(await reversalEntries(s.review._id)).toHaveLength(0);

    const medium = await returnSize("M");
    expect((await setReturnStatus(s, medium._id, "Refunded")).status).toBe(200);
    expect(await reversalEntries(s.review._id)).toHaveLength(1);
    expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 0 });
  });

  it("with the bonus already spent, the refund reversal takes what is left and records the rest as owed", async () => {
    const s = await paidThenFullReturn();
    await applyLoyaltyPointsChange({
      userId: s.customer._id,
      type: "redeemed",
      source: "order",
      points: -30,
      key: "test:spent-30",
    });

    expect((await setReturnStatus(s, s.rr._id, "Refunded")).status).toBe(200);

    expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 30 });
    expect((await savedReview(s.review._id)).bonusReversal).toMatchObject({ pointsDebited: 20, shortfall: 30 });
  });

  it("full return refunded after the bonus batch expired: nothing debited, nothing owed, no ledger row", async () => {
    const s = await paidThenFullReturn();
    await extraCredit(s.customer._id);
    await LoyaltyLot.updateOne(
      { key: `review:${s.review._id}` },
      { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } },
    );
    await expireDueLots();
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });

    expect((await setReturnStatus(s, s.rr._id, "Refunded")).status).toBe(200);

    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await reversalEntries(s.review._id)).toHaveLength(0);
    expect((await savedReview(s.review._id)).bonusReversal).toMatchObject({
      reason: "Item returned",
      points: REVIEW_BONUS_POINTS,
      pointsDebited: 0,
      shortfall: 0,
      expiredPortion: REVIEW_BONUS_POINTS,
    });

    // Already recorded as reversed: an admin reversal now is refused.
    expect((await reverse(s)).status).toBe(409);
  });

  it("order cancelled after a partly expired bonus: only the valid part is taken", async () => {
    const s = await setup();
    await approve(s);
    // 20 spent while valid; the remaining 30 then expire.
    await applyLoyaltyPointsChange({
      userId: s.customer._id,
      type: "redeemed",
      source: "order",
      points: -20,
      key: "test:spent-20",
    });
    await LoyaltyLot.updateOne(
      { key: `review:${s.review._id}` },
      { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } },
    );
    await expireDueLots();

    expect((await setOrderStatus(s, "Cancelled")).status).toBe(200);

    expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 20 });
    expect((await savedReview(s.review._id)).bonusReversal).toMatchObject({
      reason: "Order cancelled",
      pointsDebited: 0,
      shortfall: 20,
      expiredPortion: 30,
    });
  });

  it("cancelled order at approval: stays on hold, and Grant bonus is refused (409) with no ledger entry or balance change", async () => {
    const s = await setup({ orderOverrides: { orderStatus: "Cancelled" } });

    const res = await approve(s);
    expect(res.status).toBe(200);
    await expectHeld(s, "order_cancelled");

    const granted = await grant(s);
    expect(granted.status).toBe(409);
    expect(granted.body.code).toBe("BONUS_STILL_HELD");
    expect(granted.body.bonusHold).toEqual({ reason: "order_cancelled" });
    await expectHeld(s, "order_cancelled");
    expect(await LoyaltyTransaction.countDocuments({ user: s.customer._id })).toBe(0);
  });

  it("deleted order at approval: Grant bonus is refused (409) with no ledger entry", async () => {
    const s = await setup({ orderOverrides: { orderStatus: "Cancelled", isActive: false } });
    await approve(s);

    const granted = await grant(s);

    expect(granted.status).toBe(409);
    expect(granted.body.code).toBe("BONUS_STILL_HELD");
    await expectHeld(s, "order_deleted");
    expect(await LoyaltyTransaction.countDocuments({ user: s.customer._id })).toBe(0);
  });

  it("soft-deleted order at approval: 0 points, held", async () => {
    const s = await setup({ orderOverrides: { orderStatus: "Cancelled", isActive: false } });

    await approve(s);

    await expectHeld(s, "order_deleted");
  });

  it("order cancelled after payment: the bonus is reversed in the cancellation, and deleting it later doesn't debit again", async () => {
    const s = await setup();
    await approve(s);
    await extraCredit(s.customer._id);

    expect((await setOrderStatus(s, "Cancelled")).status).toBe(200);

    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    expect((await savedReview(s.review._id)).bonusReversal.reason).toBe("Order cancelled");

    // PR-7: a delivered order can be deleted only once its parcel is settled.
    const settled = await request(app)
      .put(`/api/orders/${s.order._id}/stock-return`)
      .set("Authorization", `Bearer ${s.adminToken}`)
      .send({ outcome: "received" });
    expect(settled.status).toBe(200);

    expect((await deleteOrder(s)).status).toBe(200);
    expect(await reversalEntries(s.review._id)).toHaveLength(1);
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await capUsed(s.order._id)).toBe(ORDER_REVIEW_BONUS_CAP);
  });

  it("soft-deleting an order whose bonus is still paid (cancelled before this rule) reverses it", async () => {
    const s = await setup();
    await approve(s);
    await Order.updateOne({ _id: s.order._id }, { $set: { orderStatus: "Cancelled" } });

    expect((await deleteOrder(s)).status).toBe(200);

    expect((await Order.findById(s.order._id)).isActive).toBe(false);
    expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 0 });
    expect((await savedReview(s.review._id)).bonusReversal.reason).toBe("Order deleted");
    expect(await reversalEntries(s.review._id)).toHaveLength(1);
  });

  it("the cap stays used after a reversal: another review on the same order earns nothing", async () => {
    const s = await setup({ extraProducts: 1 });
    await approve(s);
    const rr = await openReturn(s);
    expect((await setReturnStatus(s, rr._id, "Refunded")).status).toBe(200);
    expect(await reversalEntries(s.review._id)).toHaveLength(1);

    const other = await makeReview(s.customer, s.extras[0], s.order);
    const res = await request(app)
      .put(`/api/reviews/${other._id}/approve`)
      .set("Authorization", `Bearer ${s.adminToken}`);

    expect(res.status).toBe(200);
    expect((await Review.findById(other._id)).pointsAwarded).toBe(0);
    expect(await capUsed(s.order._id)).toBe(ORDER_REVIEW_BONUS_CAP);
    expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 0 });
  });

  it("a refund's auto-reversal racing an admin reversal debits once", async () => {
    const s = await paidThenFullReturn();
    await extraCredit(s.customer._id);

    const [refund, reversal] = await Promise.all([setReturnStatus(s, s.rr._id, "Refunded"), reverse(s)]);

    expect(refund.status).toBe(200);
    expect([200, 409]).toContain(reversal.status);
    expect(await reversalEntries(s.review._id)).toHaveLength(1);
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    expect((await ReturnRequest.findById(s.rr._id)).status).toBe("Refunded");
  });

  it("an admin reversal, then the return refunded: no second debit", async () => {
    const s = await paidThenFullReturn();
    await extraCredit(s.customer._id);

    expect((await reverse(s)).status).toBe(200);
    expect((await setReturnStatus(s, s.rr._id, "Refunded")).status).toBe(200);

    expect(await reversalEntries(s.review._id)).toHaveLength(1);
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    const saved = await savedReview(s.review._id);
    expect(saved.bonusReversal.reason).toBe(REASON);
    expect(String(saved.bonusReversal.reversedBy)).toBe(String(s.admin._id));
  });

  it("an order cancellation racing an admin reversal debits once", async () => {
    const s = await setup();
    await approve(s);
    await extraCredit(s.customer._id);

    const [cancel, reversal] = await Promise.all([setOrderStatus(s, "Cancelled"), reverse(s)]);

    expect(cancel.status).toBe(200);
    expect([200, 409]).toContain(reversal.status);
    expect(await reversalEntries(s.review._id)).toHaveLength(1);
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
  });

  it("after an admin reversal, a later order cancellation does not debit again", async () => {
    const s = await setup();
    await approve(s);
    await extraCredit(s.customer._id);

    expect((await reverse(s)).status).toBe(200);
    expect((await setOrderStatus(s, "Cancelled")).status).toBe(200);

    expect(await reversalEntries(s.review._id)).toHaveLength(1);
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    expect((await savedReview(s.review._id)).bonusReversal.reason).toBe(REASON);
  });
});

describe("Deleting a rewarded review", () => {
  const deleteReview = (s, reviewId = s.review._id) =>
    request(app).delete(`/api/reviews/${reviewId}`).set("Authorization", `Bearer ${s.adminToken}`);

  it("reverses the bonus once (expired part neither taken nor owed) and keeps the order cap used", async () => {
    const s = await setup();
    await approve(s);
    // 10 spent while valid; the other 40 then expire.
    await applyLoyaltyPointsChange({
      userId: s.customer._id,
      type: "redeemed",
      source: "order",
      points: -10,
      key: "test:spent-10",
    });
    await LoyaltyLot.updateOne(
      { key: `review:${s.review._id}` },
      { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } },
    );
    await expireDueLots();

    expect((await deleteReview(s)).status).toBe(200);

    expect(await balance(s.customer._id)).toEqual({ points: 0, owed: 10 });
    const clawbacks = await reversalEntries(s.review._id);
    expect(clawbacks).toHaveLength(1);
    expect(clawbacks[0]).toMatchObject({ key: `review-reversal:${s.review._id}`, shortfall: 10 });
    expect(await capUsed(s.order._id)).toBe(ORDER_REVIEW_BONUS_CAP);
  });

  it("a new review on the same order afterwards earns 0 points; ledger and cap unchanged", async () => {
    const s = await setup({ extraProducts: 1 });
    await approve(s);
    await extraCredit(s.customer._id);
    expect((await deleteReview(s)).status).toBe(200);
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    const ledgerBefore = await LoyaltyTransaction.countDocuments({ user: s.customer._id });

    // A resubmitted review of the same product, and one of the other product.
    const again = await makeReview(s.customer, s.product, s.order);
    const other = await makeReview(s.customer, s.extras[0], s.order);
    for (const review of [again, other]) {
      const res = await request(app)
        .put(`/api/reviews/${review._id}/approve`)
        .set("Authorization", `Bearer ${s.adminToken}`);
      expect(res.status).toBe(200);
      expect((await Review.findById(review._id)).pointsAwarded).toBe(0);
    }

    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await LoyaltyTransaction.countDocuments({ user: s.customer._id })).toBe(ledgerBefore);
    expect(await capUsed(s.order._id)).toBe(ORDER_REVIEW_BONUS_CAP);
  });

  it("after a delete-reversal, a later full-return refund and order cancellation do not debit again", async () => {
    const s = await setup();
    await approve(s);
    await extraCredit(s.customer._id);
    expect((await deleteReview(s)).status).toBe(200);
    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });

    const rr = await openReturn(s);
    expect((await setReturnStatus(s, rr._id, "Refunded")).status).toBe(200);
    expect((await setOrderStatus(s, "Cancelled")).status).toBe(200);

    expect(await balance(s.customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await LoyaltyTransaction.countDocuments({ review: s.review._id, type: "clawback" })).toBe(1);
  });
});

describe("Grant bonus needs the reviews + loyalty permissions", () => {
  const staffWith = async (permissions) => {
    const role = await Role.create({ name: `Staff ${permissions.join("+")}`, permissions });
    return createUser({ role: "admin", adminRole: role._id });
  };

  // Approved while the return was open, then the return rejected.
  const releasedHold = async () => {
    const s = await setup();
    const rr = await openReturn(s);
    await approve(s);
    expect((await setReturnStatus(s, rr._id, "Rejected")).status).toBe(200);
    return s;
  };

  const grantAs = (user, s) =>
    request(app).post(`/api/reviews/${s.review._id}/grant-bonus`).set("Authorization", `Bearer ${signToken(user)}`);

  it("refuses staff with only the reviews permission (403) and pays nothing", async () => {
    const s = await releasedHold();

    const res = await grantAs(await staffWith(["reviews"]), s);

    expect(res.status).toBe(403);
    await expectHeld(s, "return_in_progress");
  });

  it("lets staff with reviews + loyalty grant (200)", async () => {
    const s = await releasedHold();

    const res = await grantAs(await staffWith(["reviews", "loyalty"]), s);

    expect(res.status).toBe(200);
    await expectPaidOnce(s);
  });

  it("re-approving a held review (reviews-only staff) pays nothing; only a reviews + loyalty grant pays, once", async () => {
    const s = await releasedHold();
    const reviewsOnly = await staffWith(["reviews"]);

    const reapproved = await request(app)
      .put(`/api/reviews/${s.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(reviewsOnly)}`);

    expect(reapproved.status).toBe(200);
    expect(reapproved.body.bonusHold).toEqual({ reason: "return_rejected" });
    await expectHeld(s, "return_rejected");

    // A full admin re-approving doesn't release it either.
    expect((await approve(s)).status).toBe(200);
    await expectHeld(s, "return_rejected");

    const loyaltyStaff = await staffWith(["reviews", "loyalty"]);
    expect((await grantAs(loyaltyStaff, s)).status).toBe(200);
    expect((await grantAs(loyaltyStaff, s)).status).toBe(409);
    await expectPaidOnce(s);
  });

  it("lets a full admin (no role) grant (200)", async () => {
    const s = await releasedHold();
    expect(s.admin.adminRole ?? null).toBeNull();

    expect((await grant(s)).status).toBe(200);
    await expectPaidOnce(s);
  });
});
