import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";

// Several cases hit /api/products (searchLimiter) and other limited routes
// more often than a real visitor would; the limiters read
// DISABLE_AUTH_RATE_LIMIT at module load. vi.hoisted runs before every
// import below, so the flag is set before app.js builds them, and app.js
// still loads as a normal static import. Never set in production.
vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
});

import "./setup.js";
import app from "../app.js";
import User from "../models/User.js";
import Review from "../models/Review.js";
import Role from "../models/Role.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import mongoose from "mongoose";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { REVIEW_BONUS_POINTS, ADMIN_REVIEW_LIST_CAP } from "../controllers/reviewController.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const auth = (user) => ({ Authorization: `Bearer ${signToken(user)}` });

const makeReview = (product, user, overrides = {}) =>
  Review.create({
    product: product._id,
    user: user._id,
    rating: 5,
    content: "Nice product",
    isApproved: true,
    ...overrides,
  });

const hide = (admin, id, body = { reason: "Off-topic" }) =>
  request(app).put(`/api/reviews/${id}/hide`).set(auth(admin)).send(body);

const unhide = (admin, id) => request(app).put(`/api/reviews/${id}/unhide`).set(auth(admin));

const publicProductReviews = (product) => request(app).get(`/api/reviews/product/${product._id}`);

const listedProduct = async (product) => {
  const res = await request(app).get("/api/products");
  expect(res.status).toBe(200);
  return res.body.products.find((p) => String(p._id) === String(product._id));
};

describe("Review moderation: hide / unhide", () => {
  it("lets only an admin with the reviews permission hide or unhide", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "admin" });
    const otherRole = await Role.create({ name: "Orders only", permissions: ["orders"] });
    const staffNoPerm = await createUser({ role: "admin", adminRole: otherRole._id });
    const reviewsRole = await Role.create({ name: "Reviews only", permissions: ["reviews"] });
    const staffWithPerm = await createUser({ role: "admin", adminRole: reviewsRole._id });
    const product = await createProduct();
    const review = await makeReview(product, customer);

    expect((await request(app).put(`/api/reviews/${review._id}/hide`).send({ reason: "x" })).status).toBe(401);
    expect((await hide(customer, review._id)).status).toBe(403);
    expect((await hide(staffNoPerm, review._id)).status).toBe(403);
    expect((await unhide(customer, review._id)).status).toBe(403);
    expect((await Review.findById(review._id)).isHidden).toBe(false);

    const ok = await hide(staffWithPerm, review._id);
    expect(ok.status).toBe(200);
    expect(ok.body.review.isHidden).toBe(true);

    const okUnhide = await unhide(admin, review._id);
    expect(okUnhide.status).toBe(200);
    expect(okUnhide.body.review.isHidden).toBe(false);
  });

  it("requires a non-blank reason of at most 500 characters, and records who hid it", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const review = await makeReview(product, customer);

    for (const body of [{}, { reason: "" }, { reason: "   " }, { reason: ["spam"] }, { reason: { $gt: "" } }, { reason: "x".repeat(501) }]) {
      const res = await hide(admin, review._id, body);
      expect(res.status).toBe(400);
    }
    expect((await Review.findById(review._id)).isHidden).toBe(false);

    const res = await hide(admin, review._id, { reason: "  Abusive language  " });
    expect(res.status).toBe(200);

    const saved = await Review.findById(review._id);
    expect(saved.isHidden).toBe(true);
    expect(saved.hiddenReason).toBe("Abusive language");
    expect(String(saved.hiddenBy)).toBe(String(admin._id));
    expect(saved.hiddenAt).toBeInstanceOf(Date);
  });

  it("removes a hidden review from every public endpoint, count and average — and unhide restores it", async () => {
    const a = await createUser();
    const b = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const good = await makeReview(product, a, { rating: 5, photoConsent: true, images: ["https://example.com/a.jpg"] });
    const bad = await makeReview(product, b, { rating: 1, photoConsent: true, images: ["https://example.com/b.jpg"] });

    let pub = await publicProductReviews(product);
    expect(pub.body.totalReviews).toBe(2);
    expect(pub.body.averageRating).toBe(3);

    expect((await hide(admin, bad._id)).status).toBe(200);

    pub = await publicProductReviews(product);
    expect(pub.body.totalReviews).toBe(1);
    expect(pub.body.averageRating).toBe(5);
    expect(pub.body.reviews.map((r) => r._id)).toEqual([String(good._id)]);
    // No moderation details leak on the visible review either.
    for (const r of pub.body.reviews) {
      expect(r).not.toHaveProperty("hiddenReason");
      expect(r).not.toHaveProperty("hiddenBy");
      expect(r).not.toHaveProperty("isHidden");
    }

    const showcase = await request(app).get("/api/reviews/showcase");
    expect(showcase.body.reviews.map((r) => r._id)).toEqual([String(good._id)]);

    let listed = await listedProduct(product);
    expect(listed.totalReviews).toBe(1);
    expect(listed.averageRating).toBe(5);

    expect((await unhide(admin, bad._id)).status).toBe(200);

    pub = await publicProductReviews(product);
    expect(pub.body.totalReviews).toBe(2);
    expect(pub.body.averageRating).toBe(3);
    const showcaseAfter = await request(app).get("/api/reviews/showcase");
    expect(showcaseAfter.body.reviews).toHaveLength(2);
    listed = await listedProduct(product);
    expect(listed.totalReviews).toBe(2);

    const saved = await Review.findById(bad._id);
    expect(saved.hiddenReason).toBe("");
    expect(saved.hiddenBy).toBeNull();
    expect(saved.hiddenAt).toBeNull();
  });

  it("refuses to approve a hidden review (409) with no state change and no points", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    await createOrder({ user: customer, products: [product] });

    const submitted = await request(app)
      .post("/api/reviews")
      .set(auth(customer))
      .send({ productId: product._id.toString(), rating: 5, content: "Loved it" });
    expect(submitted.status).toBe(201);
    const id = submitted.body.review._id;

    expect((await hide(admin, id)).status).toBe(200);
    const before = await Review.findById(id).lean();

    const approved = await request(app).put(`/api/reviews/${id}/approve`).set(auth(admin));
    expect(approved.status).toBe(409);
    expect(approved.body.success).toBe(false);
    expect(approved.body.message).toBe("This review is hidden. Unhide it before approving.");

    expect(await Review.findById(id).lean()).toEqual(before);
    expect(before.isApproved).toBe(false);
    expect(before.reviewPointsProcessed).not.toBe(true);
    expect((await User.findById(customer._id).lean()).loyaltyPoints || 0).toBe(0);
    expect(await LoyaltyTransaction.countDocuments({ user: customer._id })).toBe(0);
    expect(await LoyaltyLot.countDocuments({ user: customer._id })).toBe(0);
    expect((await publicProductReviews(product)).body.totalReviews).toBe(0);

    // Once unhidden it can be approved, and the bonus is granted then.
    expect((await unhide(admin, id)).status).toBe(200);
    const approvedNow = await request(app).put(`/api/reviews/${id}/approve`).set(auth(admin));
    expect(approvedNow.status).toBe(200);
    expect((await User.findById(customer._id).lean()).loyaltyPoints).toBe(REVIEW_BONUS_POINTS);
  });

  it("still answers 404 when approving a missing review", async () => {
    const admin = await createUser({ role: "admin" });
    const res = await request(app).put("/api/reviews/64b7f0f0f0f0f0f0f0f0f0f0/approve").set(auth(admin));
    expect(res.status).toBe(404);
  });

  it("never changes the reviewer's loyalty points or ledger", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    await createOrder({ user: customer, products: [product] });

    const submitted = await request(app)
      .post("/api/reviews")
      .set(auth(customer))
      .send({ productId: product._id.toString(), rating: 5, content: "Loved it" });
    expect(submitted.status).toBe(201);
    const id = submitted.body.review._id;

    await request(app).put(`/api/reviews/${id}/approve`).set(auth(admin));

    const snapshot = async () => {
      const [user, txns, lots, review] = await Promise.all([
        User.findById(customer._id).lean(),
        LoyaltyTransaction.find({ user: customer._id }).sort({ _id: 1 }).lean(),
        LoyaltyLot.find({ user: customer._id }).sort({ _id: 1 }).lean(),
        Review.findById(id).lean(),
      ]);
      return {
        points: user.loyaltyPoints,
        txns: JSON.stringify(txns),
        lots: JSON.stringify(lots),
        pointsAwarded: review.pointsAwarded,
        reviewPointsProcessed: review.reviewPointsProcessed,
      };
    };

    const before = await snapshot();
    expect(before.points).toBe(REVIEW_BONUS_POINTS);
    expect(before.pointsAwarded).toBe(REVIEW_BONUS_POINTS);

    expect((await hide(admin, id)).status).toBe(200);
    expect(await snapshot()).toEqual(before);

    expect((await unhide(admin, id)).status).toBe(200);
    expect(await snapshot()).toEqual(before);

    // Re-approving after unhide must not credit the bonus again.
    await request(app).put(`/api/reviews/${id}/approve`).set(auth(admin));
    expect(await snapshot()).toEqual(before);
  });

  it("answers 404 for a missing review and 400 for a malformed id", async () => {
    const admin = await createUser({ role: "admin" });
    const missing = "64b7f0f0f0f0f0f0f0f0f0f0";

    expect((await hide(admin, missing)).status).toBe(404);
    expect((await unhide(admin, missing)).status).toBe(404);
    expect((await request(app).put(`/api/reviews/${missing}/reply`).set(auth(admin)).send({ text: "Hi" })).status).toBe(404);
    expect((await request(app).delete(`/api/reviews/${missing}/reply`).set(auth(admin))).status).toBe(404);

    expect((await hide(admin, "not-an-id")).status).toBe(400);
    expect((await unhide(admin, "not-an-id")).status).toBe(400);
    expect((await request(app).put("/api/reviews/not-an-id/reply").set(auth(admin)).send({ text: "Hi" })).status).toBe(400);
    expect((await request(app).delete("/api/reviews/not-an-id/reply").set(auth(admin))).status).toBe(400);
  });
});

describe("Review moderation: admin reply", () => {
  const reply = (admin, id, body) => request(app).put(`/api/reviews/${id}/reply`).set(auth(admin)).send(body);

  it("creates, edits and removes a reply; shows it publicly without the admin id", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const review = await makeReview(product, customer);

    const created = await reply(admin, review._id, { text: "  Thank you for shopping with us!  " });
    expect(created.status).toBe(200);
    expect(created.body.review.adminReply.text).toBe("Thank you for shopping with us!");
    expect(String(created.body.review.adminReply.repliedBy)).toBe(String(admin._id));
    const firstRepliedAt = created.body.review.adminReply.repliedAt;
    expect(firstRepliedAt).toBeTruthy();

    let pub = await publicProductReviews(product);
    const shown = pub.body.reviews[0].adminReply;
    expect(shown.text).toBe("Thank you for shopping with us!");
    expect(shown).not.toHaveProperty("repliedBy");
    expect(JSON.stringify(pub.body)).not.toContain(String(admin._id));

    const showcaseReview = await makeReview(await createProduct(), customer, { photoConsent: true, images: ["https://example.com/p.jpg"] });
    await reply(admin, showcaseReview._id, { text: "Lovely photo" });
    const showcase = await request(app).get("/api/reviews/showcase");
    expect(showcase.body.reviews[0].adminReply.text).toBe("Lovely photo");
    expect(JSON.stringify(showcase.body)).not.toContain(String(admin._id));

    const edited = await reply(admin, review._id, { text: "<b>Updated</b> reply" });
    expect(edited.status).toBe(200);
    // Stored verbatim as plain text — the client renders it as a text node.
    expect(edited.body.review.adminReply.text).toBe("<b>Updated</b> reply");
    expect(edited.body.review.adminReply.repliedAt).toBe(firstRepliedAt);
    expect(edited.body.review.adminReply.updatedAt).toBeTruthy();

    const removed = await request(app).delete(`/api/reviews/${review._id}/reply`).set(auth(admin));
    expect(removed.status).toBe(200);
    expect(removed.body.review.adminReply).toBeNull();

    pub = await publicProductReviews(product);
    expect(pub.body.reviews[0].adminReply ?? null).toBeNull();
  });

  it("saves the reply in one atomic update and restarts repliedAt after a removal", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const review = await makeReview(product, customer);

    // No read before the write: the reply is a single update.
    const findById = vi.spyOn(Review, "findById");
    const first = await reply(admin, review._id, { text: "First reply" });
    expect(first.status).toBe(200);
    expect(findById).not.toHaveBeenCalled();
    findById.mockRestore();

    const firstRepliedAt = first.body.review.adminReply.repliedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const edited = await reply(admin, review._id, { text: "Edited reply" });
    expect(edited.body.review.adminReply.repliedAt).toBe(firstRepliedAt);
    expect(new Date(edited.body.review.adminReply.updatedAt).getTime()).toBeGreaterThan(
      new Date(firstRepliedAt).getTime(),
    );

    // Removing the reply and replying again starts a fresh repliedAt.
    expect((await request(app).delete(`/api/reviews/${review._id}/reply`).set(auth(admin))).status).toBe(200);
    expect((await Review.findById(review._id).lean()).adminReply).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5));

    const again = await reply(admin, review._id, { text: "New reply" });
    expect(again.status).toBe(200);
    expect(again.body.review.adminReply.text).toBe("New reply");
    expect(new Date(again.body.review.adminReply.repliedAt).getTime()).toBeGreaterThan(
      new Date(firstRepliedAt).getTime(),
    );

    // Text is stored literally, even if it looks like an aggregation
    // field path or operator.
    const literal = await reply(admin, review._id, { text: "$adminReply.text" });
    expect(literal.status).toBe(200);
    expect((await Review.findById(review._id).lean()).adminReply.text).toBe("$adminReply.text");
  });

  it("requires non-blank text of at most 1000 characters and an admin", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const review = await makeReview(product, customer);

    for (const body of [{}, { text: "" }, { text: "   " }, { text: 42 }, { text: ["a"] }, { text: "x".repeat(1001) }]) {
      expect((await reply(admin, review._id, body)).status).toBe(400);
    }
    expect((await reply(admin, review._id, { text: "x".repeat(1000) })).status).toBe(200);

    expect((await reply(customer, review._id, { text: "Hijack" })).status).toBe(403);
    expect((await request(app).delete(`/api/reviews/${review._id}/reply`).set(auth(customer))).status).toBe(403);
    expect((await Review.findById(review._id)).adminReply.text).toBe("x".repeat(1000));
  });
});

describe("Review moderation: admin filters and summary", () => {
  const list = (admin, query = "") => request(app).get(`/api/reviews/admin${query}`).set(auth(admin));

  const seed = async () => {
    const admin = await createUser({ role: "admin" });
    const users = await Promise.all([1, 2, 3, 4].map(() => createUser()));
    const product = await createProduct();
    const day = (d) => new Date(`2026-11-${d}T06:00:00Z`); // 11:30 IST

    const r1 = await makeReview(product, users[0], { rating: 5, pointsAwarded: 50, reviewPointsProcessed: true, images: ["https://example.com/1.jpg"] });
    const r2 = await makeReview(product, users[1], { rating: 4, pointsAwarded: 0, reviewPointsProcessed: true });
    const r3 = await makeReview(product, users[2], { rating: 3, isApproved: false });
    const r4 = await makeReview(product, users[3], { rating: 1, pointsAwarded: 50, reviewPointsProcessed: true, isHidden: true, hiddenReason: "Spam" });
    // createdAt is managed by timestamps — set it directly afterwards.
    await Review.collection.updateOne({ _id: r1._id }, { $set: { createdAt: day("01") } });
    await Review.collection.updateOne({ _id: r2._id }, { $set: { createdAt: day("05") } });
    await Review.collection.updateOne({ _id: r3._id }, { $set: { createdAt: day("10") } });
    await Review.collection.updateOne({ _id: r4._id }, { $set: { createdAt: day("12") } });

    return { admin, ids: { r1: String(r1._id), r2: String(r2._id), r3: String(r3._id), r4: String(r4._id) } };
  };

  const idsOf = (res) => res.body.reviews.map((r) => r._id).sort();

  it("filters by status, visibility, rating, photos, rewarded and date range", async () => {
    const { admin, ids } = await seed();
    const expectIds = async (query, expected) => {
      const res = await list(admin, query);
      expect(res.status, query).toBe(200);
      expect(idsOf(res), query).toEqual(expected.map((k) => ids[k]).sort());
    };

    await expectIds("", ["r1", "r2", "r3", "r4"]);
    await expectIds("?status=all", ["r1", "r2", "r3", "r4"]);
    await expectIds("?status=pending", ["r3"]);
    await expectIds("?status=approved", ["r1", "r2", "r4"]);
    await expectIds("?visibility=hidden", ["r4"]);
    await expectIds("?visibility=visible", ["r1", "r2", "r3"]);
    await expectIds("?rating=4", ["r2"]);
    await expectIds("?hasPhotos=true", ["r1"]);
    await expectIds("?hasPhotos=false", ["r2", "r3", "r4"]);
    await expectIds("?rewarded=true", ["r1", "r4"]);
    await expectIds("?rewarded=false", ["r2", "r3"]);
    await expectIds("?from=2026-11-05", ["r2", "r3", "r4"]);
    await expectIds("?to=2026-11-05", ["r1", "r2"]);
    await expectIds("?from=2026-11-05&to=2026-11-10", ["r2", "r3"]);
    await expectIds("?status=approved&visibility=visible&rewarded=true", ["r1"]);

    // Sort order still works alongside filters.
    const asc = await list(admin, "?status=approved&sortOrder=asc");
    expect(asc.body.reviews.map((r) => r._id)).toEqual([ids.r1, ids.r2, ids.r4]);
  });

  it("rejects unknown or injection-shaped filter values with 400, never 500", async () => {
    const { admin } = await seed();

    for (const query of [
      "?status=rejected",
      "?status=pending&status=approved",
      "?visibility=maybe",
      "?rating=0",
      "?rating=6",
      "?rating=4.5",
      "?hasPhotos=yes",
      "?rewarded=1",
      "?from=yesterday",
      "?from=2026-02-31",
      "?to=2026-13-01",
      "?from=2026-11-10&to=2026-11-01",
    ]) {
      const res = await list(admin, query);
      expect(res.status, query).toBe(400);
      expect(res.body.success, query).toBe(false);
    }

    // Express 5's simple query parser keeps bracket keys literal
    // ("status[$ne]"), so they're unknown params: ignored, never an operator.
    for (const query of ["?status[$ne]=x", "?rating[$gt]=0"]) {
      const res = await list(admin, query);
      expect(res.status, query).toBe(200);
      expect(res.body.reviews, query).toHaveLength(4);
    }
  });

  it("flags a capped list as truncated with the real total for the same filter", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const count = ADMIN_REVIEW_LIST_CAP + 3;

    await Review.insertMany(
      Array.from({ length: count }, (_, i) => ({
        product: new mongoose.Types.ObjectId(),
        user: customer._id,
        rating: i < 5 ? 4 : 5,
        content: "Bulk review",
        isApproved: true,
      })),
    );

    const all = await list(admin);
    expect(all.status).toBe(200);
    expect(all.body.reviews).toHaveLength(ADMIN_REVIEW_LIST_CAP);
    expect(all.body.truncated).toBe(true);
    expect(all.body.total).toBe(count);

    const fewer = await list(admin, "?rating=4");
    expect(fewer.body.reviews).toHaveLength(5);
    expect(fewer.body.truncated).toBe(false);
    expect(fewer.body.total).toBe(5);
  }, 60000);

  it("returns photoConsent in the admin list", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    await makeReview(await createProduct(), customer, { photoConsent: true, images: ["https://example.com/a.jpg"] });
    await makeReview(await createProduct(), customer, { images: ["https://example.com/b.jpg"] });

    const res = await list(admin);
    const consents = res.body.reviews.map((r) => r.photoConsent).sort();
    expect(consents).toEqual([false, true]);
  });

  it("keeps the admin list and summary admin-only", async () => {
    const customer = await createUser();
    expect((await request(app).get("/api/reviews/admin/summary")).status).toBe(401);
    expect((await request(app).get("/api/reviews/admin/summary").set(auth(customer))).status).toBe(403);
    expect((await list(customer, "?status=pending")).status).toBe(403);
  });

  it("summarises totals, status, hidden count and rewarded vs non-rewarded averages", async () => {
    const { admin } = await seed();

    const res = await request(app).get("/api/reviews/admin/summary").set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 4,
      byStatus: { approved: 3, pending: 1 },
      hidden: 1,
      public: 2,
      averageRating: 3.25, // (5+4+3+1)/4
      publicAverageRating: 4.5, // r1 + r2
      rewarded: { count: 2, averageRating: 3 }, // r1 (5) + r4 (1)
      reversed: 0,
      nonRewarded: { count: 2, averageRating: 3.5 }, // r2 (4) + r3 (3)
    });
  });

  it("reports null averages for an empty store", async () => {
    const admin = await createUser({ role: "admin" });
    const res = await request(app).get("/api/reviews/admin/summary").set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(0);
    expect(res.body.summary.averageRating).toBeNull();
    expect(res.body.summary.rewarded).toEqual({ count: 0, averageRating: null });
  });
});
