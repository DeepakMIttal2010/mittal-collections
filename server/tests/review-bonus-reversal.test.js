import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  return { sendEmail: vi.fn() };
});
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// A real (single-member) replica set, so the claim, the ledger debit and
// the review record go through an actual MongoDB transaction — the way
// production (Atlas) runs.
import "./setup-replset.js";
import app from "../app.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Review from "../models/Review.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Role from "../models/Role.js";
import { applyLoyaltyPointsChange, expireDueLots } from "../utils/loyaltyPoints.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { REVIEW_BONUS_POINTS } from "../controllers/reviewController.js";

const REASON = "Same photos posted from three different accounts";

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A customer's review, approved through the real endpoint so the bonus is
// credited exactly the way production does it.
const rewardedReview = async ({ withOrder = true, images = [] } = {}) => {
  const customer = await createUser();
  const admin = await createUser({ role: "admin" });
  const product = await createProduct();
  const order = withOrder ? await createOrder({ user: customer, products: [product] }) : null;

  const review = await Review.create({
    product: product._id,
    user: customer._id,
    order: order?._id || null,
    rating: 5,
    content: "Lovely bedsheet, colours as shown",
    images,
    photoConsent: images.length > 0,
  });

  const approved = await request(app)
    .put(`/api/reviews/${review._id}/approve`)
    .set("Authorization", `Bearer ${signToken(admin)}`);
  expect(approved.status).toBe(200);

  return { customer, admin, product, order, review };
};

const reverse = (user, reviewId, body = { reason: REASON }) =>
  request(app)
    .post(`/api/reviews/${reviewId}/reverse-bonus`)
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send(body);

const balance = async (userId) => {
  const user = await User.findById(userId).select("loyaltyPoints loyaltyPointsOwed");
  return { points: user.loyaltyPoints, owed: user.loyaltyPointsOwed || 0 };
};

const reversalEntries = (reviewId) =>
  LoyaltyTransaction.find({ review: reviewId, source: "review_bonus_reversal" });

describe("Admin review-bonus reversal", () => {
  it("is admin-only: a customer (even the reviewer) is refused and nothing changes", async () => {
    const { customer, review } = await rewardedReview();

    const res = await reverse(customer, review._id);
    const anonymous = await request(app)
      .post(`/api/reviews/${review._id}/reverse-bonus`)
      .send({ reason: REASON });

    expect(res.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await balance(customer._id)).toEqual({ points: REVIEW_BONUS_POINTS, owed: 0 });
    expect((await Review.findById(review._id).select("+bonusReversal")).bonusReversal).toBeUndefined();
  });

  it("requires a reason of 10-1000 characters and caps evidence", async () => {
    const { customer, admin, review } = await rewardedReview();

    expect((await reverse(admin, review._id, {})).status).toBe(400);
    expect((await reverse(admin, review._id, { reason: "   fake    " })).status).toBe(400);
    expect((await reverse(admin, review._id, { reason: "x".repeat(1001) })).status).toBe(400);
    expect((await reverse(admin, review._id, { reason: REASON, evidence: "e".repeat(2001) })).status).toBe(400);

    expect(await balance(customer._id)).toEqual({ points: REVIEW_BONUS_POINTS, owed: 0 });
    expect(await reversalEntries(review._id)).toHaveLength(0);
  });

  it("refuses a review that never received a bonus (400) and an unknown review (404)", async () => {
    // No linked order: approved and public, but earns no bonus.
    const { admin, review } = await rewardedReview({ withOrder: false });
    expect((await Review.findById(review._id)).pointsAwarded).toBe(0);

    const res = await reverse(admin, review._id);
    const missing = await reverse(admin, "64b000000000000000000000");

    expect(res.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(await LoyaltyTransaction.countDocuments({ source: "review_bonus_reversal" })).toBe(0);
  });

  it("debits exactly the bonus from its own batch, writes the ledger entry and records the reversal", async () => {
    const { customer, admin, review, order } = await rewardedReview();

    const res = await reverse(admin, review._id, {
      reason: `  ${REASON}  `,
      evidence: "Reverse image search matched a marketplace listing",
    });

    expect(res.status).toBe(200);
    expect(res.body.bonusReversal).toMatchObject({
      points: REVIEW_BONUS_POINTS,
      pointsDebited: REVIEW_BONUS_POINTS,
      shortfall: 0,
      reason: REASON,
    });

    expect(await balance(customer._id)).toEqual({ points: 0, owed: 0 });

    const bonusLot = await LoyaltyLot.findOne({ key: `review:${review._id}` });
    expect(bonusLot.remainingPoints).toBe(0);

    const entries = await reversalEntries(review._id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "clawback",
      source: "review_bonus_reversal",
      points: -REVIEW_BONUS_POINTS,
      balanceAfter: 0,
      key: `review-reversal:${review._id}`,
    });
    expect(String(entries[0].order)).toBe(String(order._id));
    expect(String(entries[0].actor.id)).toBe(String(admin._id));
    expect(entries[0].allocations.map((a) => [String(a.lot), a.points])).toEqual([
      [String(bonusLot._id), REVIEW_BONUS_POINTS],
    ]);

    const saved = await Review.findById(review._id).select("+bonusReversal");
    expect(saved.bonusReversal).toMatchObject({
      reason: REASON,
      evidence: "Reverse image search matched a marketplace listing",
      points: REVIEW_BONUS_POINTS,
      pointsDebited: REVIEW_BONUS_POINTS,
      shortfall: 0,
    });
    expect(String(saved.bonusReversal.reversedBy)).toBe(String(admin._id));
    expect(saved.bonusReversal.reversedAt).toBeInstanceOf(Date);
    // The review itself is untouched — hiding/deleting is a separate step.
    expect(saved.isApproved).toBe(true);
    expect(saved.pointsAwarded).toBe(REVIEW_BONUS_POINTS);
    // A fraudulent review's share of the order cap stays used.
    expect((await Order.findById(order._id)).reviewBonusAwarded).toBe(REVIEW_BONUS_POINTS);
  });

  it("refuses a second reversal (409) without a second debit", async () => {
    const { customer, admin, review } = await rewardedReview();
    // Some other points on the account, so a second debit would show.
    await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "admin_adjustment",
      source: "admin",
      points: 100,
      key: "test:extra-credit",
    });

    expect((await reverse(admin, review._id)).status).toBe(200);
    const again = await reverse(admin, review._id);

    expect(again.status).toBe(409);
    expect(await balance(customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await reversalEntries(review._id)).toHaveLength(1);
  });

  it("applies only one debit when two reversal requests race", async () => {
    const { customer, admin, review } = await rewardedReview();
    await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "admin_adjustment",
      source: "admin",
      points: 100,
      key: "test:extra-credit",
    });

    const results = await Promise.all([
      reverse(admin, review._id),
      reverse(admin, review._id),
      reverse(admin, review._id),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    expect(await balance(customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await reversalEntries(review._id)).toHaveLength(1);
  });

  it("takes what is left when points were already spent and records the rest as owed — never a negative balance", async () => {
    const { customer, admin, review } = await rewardedReview();
    await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "redeemed",
      source: "order",
      points: -30,
      key: "test:spent-30",
    });
    expect(await balance(customer._id)).toEqual({ points: 20, owed: 0 });

    const res = await reverse(admin, review._id);

    expect(res.status).toBe(200);
    expect(res.body.bonusReversal).toMatchObject({ pointsDebited: 20, shortfall: 30 });
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 30 });

    const [entry] = await reversalEntries(review._id);
    expect(entry.points).toBe(-20);
    expect(entry.shortfall).toBe(30);

    const saved = await Review.findById(review._id).select("+bonusReversal");
    expect(saved.bonusReversal).toMatchObject({ pointsDebited: 20, shortfall: 30 });

    // The owed points come out of the customer's next credit first.
    await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "admin_adjustment",
      source: "admin",
      points: 50,
      key: "test:later-credit",
    });
    expect(await balance(customer._id)).toEqual({ points: 20, owed: 0 });
  });

  it("re-approving or marking seen never touches points, and deleting a reversed review doesn't debit again", async () => {
    const { customer, admin, review, order } = await rewardedReview();
    const adminToken = signToken(admin);

    await request(app).put(`/api/reviews/${review._id}/approve`).set("Authorization", `Bearer ${adminToken}`);
    await request(app).put(`/api/reviews/${review._id}/seen`).set("Authorization", `Bearer ${adminToken}`);
    expect(await balance(customer._id)).toEqual({ points: REVIEW_BONUS_POINTS, owed: 0 });
    expect(await LoyaltyTransaction.countDocuments({ review: review._id })).toBe(1);

    await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "admin_adjustment",
      source: "admin",
      points: 100,
      key: "test:extra-credit",
    });
    expect((await reverse(admin, review._id)).status).toBe(200);

    const deleted = await request(app)
      .delete(`/api/reviews/${review._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(deleted.status).toBe(200);
    expect(await balance(customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await LoyaltyTransaction.countDocuments({ review: review._id, type: "clawback" })).toBe(1);
    expect((await Order.findById(order._id)).reviewBonusAwarded).toBe(REVIEW_BONUS_POINTS);
  });

  it("keeps the reversal record out of public review endpoints but shows it to admins", async () => {
    const { admin, product, review } = await rewardedReview({
      images: ["https://res.cloudinary.com/demo/image/upload/review.jpg"],
    });
    expect((await reverse(admin, review._id)).status).toBe(200);

    const productReviews = await request(app).get(`/api/reviews/product/${product._id}`);
    const showcase = await request(app).get("/api/reviews/showcase");

    expect(productReviews.status).toBe(200);
    expect(productReviews.body.reviews).toHaveLength(1);
    expect(showcase.status).toBe(200);
    expect(showcase.body.reviews).toHaveLength(1);
    for (const body of [productReviews.text, showcase.text]) {
      expect(body).not.toContain("bonusReversal");
      expect(body).not.toContain(REASON);
    }

    const adminList = await request(app)
      .get("/api/reviews/admin")
      .set("Authorization", `Bearer ${signToken(admin)}`);
    expect(adminList.body.reviews[0].bonusReversal.reason).toBe(REASON);
  });

  it("rolls the claim back when the ledger write fails, so a retry can still reverse", async () => {
    const { customer, admin, review } = await rewardedReview();
    vi.spyOn(LoyaltyTransaction, "create").mockRejectedValueOnce(new Error("ledger down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const failed = await reverse(admin, review._id);

    expect(failed.status).toBe(500);
    expect(await balance(customer._id)).toEqual({ points: REVIEW_BONUS_POINTS, owed: 0 });
    expect((await LoyaltyLot.findOne({ key: `review:${review._id}` })).remainingPoints).toBe(REVIEW_BONUS_POINTS);
    expect((await Review.findById(review._id).select("+bonusReversal")).bonusReversal).toBeUndefined();

    const retry = await reverse(admin, review._id);

    expect(retry.status).toBe(200);
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 0 });
    expect(await reversalEntries(review._id)).toHaveLength(1);
  });
});

// Moves the bonus's batch past its expiry date (the expiry job hasn't run).
const pastExpiry = (reviewId) =>
  LoyaltyLot.updateOne(
    { key: `review:${reviewId}` },
    { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } },
  );

const spend = (userId, points, key) =>
  applyLoyaltyPointsChange({ userId, type: "redeemed", source: "order", points: -points, key });

const credit = (userId, points, key) =>
  applyLoyaltyPointsChange({ userId, type: "admin_adjustment", source: "admin", points, key });

describe("Review-bonus reversal of an expired bonus", () => {
  it("takes nothing and records nothing owed when the whole bonus already expired", async () => {
    const { customer, admin, review } = await rewardedReview();
    await pastExpiry(review._id);
    await expireDueLots();
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 0 });
    await credit(customer._id, 100, "test:other-points");

    const res = await reverse(admin, review._id);

    expect(res.status).toBe(200);
    expect(res.body.bonusReversal).toMatchObject({
      points: REVIEW_BONUS_POINTS,
      pointsDebited: 0,
      shortfall: 0,
      expiredPortion: REVIEW_BONUS_POINTS,
    });
    expect(await balance(customer._id)).toEqual({ points: 100, owed: 0 });
    expect(await reversalEntries(review._id)).toHaveLength(0);

    const saved = await Review.findById(review._id).select("+bonusReversal");
    expect(saved.bonusReversal).toMatchObject({ pointsDebited: 0, shortfall: 0, expiredPortion: 50 });
    // Still a one-time action.
    expect((await reverse(admin, review._id)).status).toBe(409);
  });

  it("reverses only the still-valid part of a partly expired bonus", async () => {
    const { customer, admin, review } = await rewardedReview();
    // 20 of the bonus spent while valid; the other 30 then expire.
    await spend(customer._id, 20, "test:spent-20");
    await pastExpiry(review._id);
    await expireDueLots();
    const lot = await LoyaltyLot.findOne({ key: `review:${review._id}` });
    expect(lot).toMatchObject({ status: "expired", expiredPoints: 30, remainingPoints: 0 });
    await credit(customer._id, 100, "test:other-points");

    const res = await reverse(admin, review._id);

    expect(res.status).toBe(200);
    expect(res.body.bonusReversal).toMatchObject({ pointsDebited: 20, shortfall: 0, expiredPortion: 30 });
    expect(await balance(customer._id)).toEqual({ points: 80, owed: 0 });
    const [entry] = await reversalEntries(review._id);
    expect(entry.points).toBe(-20);
  });

  it("treats a batch past its expiry date as expired even before the expiry job runs", async () => {
    const { customer, admin, review } = await rewardedReview();
    await credit(customer._id, 100, "test:other-points");
    await pastExpiry(review._id);

    const res = await reverse(admin, review._id);

    expect(res.status).toBe(200);
    expect(res.body.bonusReversal).toMatchObject({ pointsDebited: 0, shortfall: 0, expiredPortion: 50 });
    // The other points are untouched; the job then expires the batch.
    expect(await balance(customer._id)).toEqual({ points: 150, owed: 0 });
    await expireDueLots();
    expect(await balance(customer._id)).toEqual({ points: 100, owed: 0 });
  });

  it("records as owed only the valid part that was already spent, never the expired part", async () => {
    const { customer, admin, review } = await rewardedReview();
    // 30 spent while valid, the remaining 20 expire; nothing else left.
    await spend(customer._id, 30, "test:spent-30");
    await pastExpiry(review._id);
    await expireDueLots();
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 0 });

    const res = await reverse(admin, review._id);

    expect(res.status).toBe(200);
    expect(res.body.bonusReversal).toMatchObject({ pointsDebited: 0, shortfall: 30, expiredPortion: 20 });
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 30 });
  });

  it("reverses a bonus with no batch (from before the lot scheme) in full, as before", async () => {
    const { customer, admin, review } = await rewardedReview();
    await LoyaltyLot.deleteOne({ key: `review:${review._id}` });

    const res = await reverse(admin, review._id);

    expect(res.status).toBe(200);
    expect(res.body.bonusReversal).toMatchObject({ pointsDebited: 50, shortfall: 0, expiredPortion: 0 });
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 0 });
  });

  it("applies the same rule when a review with an expired bonus is deleted", async () => {
    const { customer, admin, review, order } = await rewardedReview();
    await spend(customer._id, 10, "test:spent-10");
    await pastExpiry(review._id);
    await expireDueLots();

    const deleted = await request(app)
      .delete(`/api/reviews/${review._id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(deleted.status).toBe(200);
    // Only the 10 valid (spent) points are reversed, as owed; the 40 expired aren't.
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 10 });
    const clawbacks = await LoyaltyTransaction.find({ review: review._id, type: "clawback" });
    expect(clawbacks).toHaveLength(1);
    expect(clawbacks[0]).toMatchObject({ points: 0, shortfall: 10 });
    expect((await Order.findById(order._id)).reviewBonusAwarded).toBe(0);
  });

  it("writes no clawback at all when a deleted review's bonus fully expired", async () => {
    const { customer, admin, review, order } = await rewardedReview();
    await pastExpiry(review._id);
    await expireDueLots();

    const deleted = await request(app)
      .delete(`/api/reviews/${review._id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(deleted.status).toBe(200);
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 0 });
    expect(await LoyaltyTransaction.countDocuments({ review: review._id, type: "clawback" })).toBe(0);
    expect((await Order.findById(order._id)).reviewBonusAwarded).toBe(0);
  });
});

describe("Review-bonus reversal needs the loyalty permission", () => {
  const staffWith = async (permissions) => {
    const role = await Role.create({ name: `Staff ${permissions.join("+")}`, permissions });
    return createUser({ role: "admin", adminRole: role._id });
  };

  it("refuses staff with only the reviews permission (403) and changes nothing", async () => {
    const { customer, review } = await rewardedReview();
    const staff = await staffWith(["reviews"]);

    const res = await reverse(staff, review._id);

    expect(res.status).toBe(403);
    expect(await balance(customer._id)).toEqual({ points: REVIEW_BONUS_POINTS, owed: 0 });
    expect((await Review.findById(review._id).select("+bonusReversal")).bonusReversal).toBeUndefined();
  });

  it("refuses staff with only the loyalty permission (403)", async () => {
    const { review } = await rewardedReview();
    expect((await reverse(await staffWith(["loyalty"]), review._id)).status).toBe(403);
  });

  it("lets staff with reviews + loyalty reverse (200)", async () => {
    const { customer, review } = await rewardedReview();
    const res = await reverse(await staffWith(["reviews", "loyalty"]), review._id);
    expect(res.status).toBe(200);
    expect(await balance(customer._id)).toEqual({ points: 0, owed: 0 });
  });

  it("lets a full admin (no role) reverse (200)", async () => {
    const { admin, review } = await rewardedReview();
    expect(admin.adminRole ?? null).toBeNull();
    expect((await reverse(admin, review._id)).status).toBe(200);
  });

  it("accepts the loyalty key in a Role, and still rejects unknown keys", async () => {
    const role = await Role.create({ name: "Loyalty desk", permissions: ["reviews", "loyalty"] });
    expect([...role.permissions]).toEqual(["reviews", "loyalty"]);
    await expect(Role.create({ name: "Bad", permissions: ["loyalty-admin"] })).rejects.toThrow(
      /Unknown permission key/,
    );
  });

  it("lets a full admin grant loyalty through the roles API", async () => {
    const admin = await createUser({ role: "admin" });
    const res = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ name: "Loyalty via API", permissions: ["reviews", "loyalty"] });
    expect(res.status).toBe(201);
    const saved = await Role.findOne({ name: "Loyalty via API" });
    expect([...saved.permissions]).toEqual(["reviews", "loyalty"]);
  });
});

describe("Admin list and summary for reversed bonuses", () => {
  it("excludes reversed bonuses from rewarded, lists them under rewarded=reversed and counts them apart", async () => {
    const first = await rewardedReview();
    const second = await rewardedReview();
    const { admin } = first;
    expect((await reverse(admin, second.review._id)).status).toBe(200);
    const unrewarded = await rewardedReview({ withOrder: false });

    const list = (query) =>
      request(app)
        .get(`/api/reviews/admin${query}`)
        .set("Authorization", `Bearer ${signToken(admin)}`);
    const ids = (res) => res.body.reviews.map((r) => String(r._id)).sort();

    const rewarded = await list("?rewarded=true");
    const reversed = await list("?rewarded=reversed");
    const notRewarded = await list("?rewarded=false");

    expect(rewarded.status).toBe(200);
    expect(ids(rewarded)).toEqual([String(first.review._id)]);
    expect(ids(reversed)).toEqual([String(second.review._id)]);
    expect(reversed.body.reviews[0].bonusReversal.reason).toBe(REASON);
    expect(ids(notRewarded)).toEqual([String(unrewarded.review._id)]);

    const summary = await request(app)
      .get("/api/reviews/admin/summary")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(summary.status).toBe(200);
    expect(summary.body.summary).toMatchObject({
      total: 3,
      reversed: 1,
      rewarded: { count: 1, averageRating: 5 },
      nonRewarded: { count: 1, averageRating: 5 },
    });
  });
});
