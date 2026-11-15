import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import request from "supertest";
import sharp from "sharp";
import mongoose from "mongoose";

// This file posts several review submissions; uploadLimiter reads
// DISABLE_AUTH_RATE_LIMIT at module load, so it is set before app.js is
// imported. Never set in production.
vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
});

import "./setup.js";
import app from "../app.js";
import cloudinary from "../config/cloudinary.js";
import reviewRoutes from "../routes/reviewRoutes.js";
import authMiddleware from "../middleware/authMiddleware.js";
import Review from "../models/Review.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { shortReviewerName, toPublicReview } from "../utils/publicReview.js";

const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

const deliveredOrder = (user, products) =>
  createOrder({
    user,
    products,
    overrides: {
      orderStatus: "Delivered",
      deliveredAt: daysAgo(3),
      statusHistory: [
        { status: "Pending", changedAt: daysAgo(6) },
        { status: "Delivered", changedAt: daysAgo(3) },
      ],
    },
  });

const PHOTO_URL = "https://res.cloudinary.com/demo/image/upload/v1/mittal-collections/privacy-photo.jpg";
const VIDEO_URL = "https://res.cloudinary.com/demo/video/upload/v1/mittal-collections/privacy-clip.mp4";

// Exactly what a public review may carry — anything else is a leak.
const PUBLIC_REVIEW_KEYS = [
  "_id",
  "content",
  "createdAt",
  "images",
  "rating",
  "rewarded",
  "title",
  "user",
  "verifiedPurchase",
  "video",
].sort();

// Every GET route on the review router that needs no login. Read from the
// router itself so a new public route added later must be covered here
// (see the "covers every public review route" test).
const publicReviewGetRoutes = () =>
  reviewRoutes.stack
    .filter((layer) => layer.route?.methods?.get)
    .filter((layer) => !layer.route.stack.some((s) => s.handle === authMiddleware))
    .map((layer) => layer.route.path)
    .sort();

// A review carrying every private thing we know of — plus fields a later
// branch might add (moderation, bonus reversal), written straight to the
// collection so the Mongoose schema can't drop them first. Only an
// allowlist serializer keeps these out.
const seedSensitiveReview = async ({ photoConsent = true } = {}) => {
  const user = await createUser({ name: "Deepak Kumar Mittal", email: "deepak.private@example.com" });
  const admin = await createUser({ role: "admin", name: "Admin Person" });
  const product = await createProduct({ name: "Privacy Test Bedsheet" });
  const order = await deliveredOrder(user, [product]);

  const { insertedId } = await Review.collection.insertOne({
    product: product._id,
    user: user._id,
    order: order._id,
    rating: 4,
    title: "",
    content: "Soft and true to the photos",
    images: [PHOTO_URL],
    video: VIDEO_URL,
    photoConsent,
    photoConsentAt: photoConsent ? new Date() : null,
    isApproved: true,
    isSeenByAdmin: true,
    reviewPointsProcessed: true,
    pointsAwarded: 50,
    // Hypothetical admin/moderation/bonus-reversal fields.
    adminNote: "SECRET-ADMIN-NOTE",
    moderationNote: "SECRET-MODERATION-NOTE",
    isHidden: false,
    hiddenBy: admin._id,
    bonusReversedBy: admin._id,
    bonusReversalReason: "SECRET-REVERSAL-REASON",
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });

  return { user, admin, product, order, reviewId: insertedId };
};

const FORBIDDEN_KEYS = [
  "order",
  "email",
  "pointsAwarded",
  "reviewPointsProcessed",
  "isSeenByAdmin",
  "isApproved",
  "photoConsent",
  "photoConsentAt",
  "adminNote",
  "moderationNote",
  "isHidden",
  "hiddenBy",
  "bonusReversedBy",
  "bonusReversalReason",
  "updatedAt",
  "__v",
];

const expectNoLeaks = (body, { user, admin, order }, { checkKeys = true } = {}) => {
  const text = JSON.stringify(body);

  expect(text).not.toContain("Deepak Kumar Mittal");
  expect(text).not.toContain("Kumar");
  expect(text).not.toContain("Mittal");
  expect(text).not.toContain("deepak.private@example.com");
  expect(text).not.toContain(String(user._id));
  expect(text).not.toContain(String(order._id));
  expect(text).not.toContain(String(admin._id));
  expect(text).not.toContain("Admin Person");
  expect(text).not.toContain("SECRET-");

  if (checkKeys) for (const key of FORBIDDEN_KEYS) expect(text).not.toContain(`"${key}"`);
};

const fetchPublic = async (path, product) => {
  const url = `/api/reviews${path.replace(":productId", String(product._id))}`;
  return request(app).get(url);
};

describe("Public review responses leak nothing private", () => {
  it("covers every public review route", () => {
    expect(publicReviewGetRoutes()).toEqual(["/product/:productId", "/showcase"].sort());
  });

  it.each(["/product/:productId", "/showcase"])("GET /api/reviews%s", async (path) => {
    const seeded = await seedSensitiveReview();

    const res = await fetchPublic(path, seeded.product);

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(1);
    expectNoLeaks(res.body, seeded);

    const [review] = res.body.reviews;
    const expectedKeys = path === "/showcase" ? [...PUBLIC_REVIEW_KEYS, "product"].sort() : PUBLIC_REVIEW_KEYS;
    expect(Object.keys(review).sort()).toEqual(expectedKeys);
    expect(Object.keys(review.user)).toEqual(["name"]);
    expect(review.user.name).toBe("Deepak M.");
    if (path === "/showcase") {
      expect(Object.keys(review.product).sort()).toEqual(["_id", "image", "name", "slug"]);
    }
  });

  it("product listing review stats carry no review content or ids", async () => {
    const seeded = await seedSensitiveReview();

    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    const listed = res.body.products.find((p) => p._id === String(seeded.product._id));
    expect(listed.totalReviews).toBe(1);
    expect(listed.averageRating).toBe(4);
    // Product documents have their own __v/updatedAt, so only values here.
    expectNoLeaks(res.body, seeded, { checkKeys: false });
    expect(JSON.stringify(res.body)).not.toContain("Soft and true to the photos");
  });
});

describe("shortReviewerName", () => {
  it.each([
    ["Deepak Mittal", "Deepak M."],
    ["  deepak   kumar mittal ", "deepak M."],
    ["Deepak", "Deepak"],
    ["दीपक मित्तल", "दीपक मि."],
    ["सीता", "सीता"],
    ["", "Customer"],
    ["   ", "Customer"],
    [undefined, "Customer"],
    [null, "Customer"],
    ["deepak@example.com", "Customer"],
    ["9876543210", "Customer"],
    ["😀 🎉", "Customer"],
    ["Anne-Marie O'Neil", "Anne-Marie O."],
  ])("%j -> %j", (input, expected) => {
    expect(shortReviewerName(input)).toBe(expected);
  });

  it("shows the short Hindi name through the public API", async () => {
    const user = await createUser({ name: "राम प्रसाद शर्मा" });
    const product = await createProduct();
    await Review.create({ product: product._id, user: user._id, rating: 5, content: "बहुत अच्छा", isApproved: true });

    const res = await request(app).get(`/api/reviews/product/${product._id}`);

    expect(res.body.reviews[0].user.name).toBe("राम श.");
    expect(JSON.stringify(res.body)).not.toContain("प्रसाद");
  });

  it("reads 'Customer' when the reviewer's account was deleted", async () => {
    const product = await createProduct();
    await Review.create({
      product: product._id,
      user: new mongoose.Types.ObjectId(),
      rating: 3,
      content: "Fine",
      isApproved: true,
    });

    const res = await request(app).get(`/api/reviews/product/${product._id}`);

    expect(res.body.reviews[0].user).toEqual({ name: "Customer" });
  });
});

describe("verifiedPurchase and rewarded flags", () => {
  it("verifiedPurchase is true only for a review linked to a delivered order", async () => {
    const buyer = await createUser();
    const legacy = await createUser();
    const product = await createProduct();
    const order = await deliveredOrder(buyer, [product]);

    await Review.create({ product: product._id, user: buyer._id, order: order._id, rating: 5, content: "Bought it", isApproved: true });
    await Review.create({ product: product._id, user: legacy._id, order: null, rating: 4, content: "Legacy", isApproved: true });

    const res = await request(app).get(`/api/reviews/product/${product._id}`);
    const byContent = Object.fromEntries(res.body.reviews.map((r) => [r.content, r]));

    expect(byContent["Bought it"].verifiedPurchase).toBe(true);
    expect(byContent.Legacy.verifiedPurchase).toBe(false);
  });

  it("rewarded is a boolean from pointsAwarded, which itself is never sent", async () => {
    const a = await createUser();
    const b = await createUser();
    const product = await createProduct();

    await Review.create({ product: product._id, user: a._id, rating: 2, content: "Rewarded", pointsAwarded: 50, isApproved: true });
    await Review.create({ product: product._id, user: b._id, rating: 5, content: "Not rewarded", pointsAwarded: 0, isApproved: true });

    const res = await request(app).get(`/api/reviews/product/${product._id}`);
    const byContent = Object.fromEntries(res.body.reviews.map((r) => [r.content, r]));

    expect(byContent.Rewarded.rewarded).toBe(true);
    expect(byContent["Not rewarded"].rewarded).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("pointsAwarded");
  });

  it("a review approved through the real flow is verified and rewarded", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    await deliveredOrder(user, [product]);

    const submitted = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: String(product._id), rating: 3, content: "Honest three stars" });
    expect(submitted.status).toBe(201);

    await request(app)
      .put(`/api/reviews/${submitted.body.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .expect(200);

    const res = await request(app).get(`/api/reviews/product/${product._id}`);

    expect(res.body.reviews[0]).toMatchObject({ verifiedPurchase: true, rewarded: true, rating: 3 });
  });
});

describe("Photo consent", () => {
  let photo;
  let uploadSpy;

  beforeAll(async () => {
    photo = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 30, g: 90, b: 160 } } })
      .jpeg()
      .toBuffer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockCloudinary = () => {
    uploadSpy = vi.spyOn(cloudinary.uploader, "upload_stream").mockImplementation((options, callback) => ({
      end: () => callback(null, { secure_url: PHOTO_URL, public_id: "mittal-collections/privacy-photo" }),
    }));
  };

  const submitWithPhoto = (user, fields) => {
    let r = request(app).post("/api/reviews").set("Authorization", `Bearer ${signToken(user)}`);
    for (const [key, value] of Object.entries(fields)) r = r.field(key, String(value));
    return r.attach("images", photo, { filename: "review.jpg", contentType: "image/jpeg" });
  };

  it.each([[undefined], ["false"], ["no"], [""]])(
    "rejects photos without consent (photoConsent=%j) with 400, before any upload",
    async (consent) => {
      mockCloudinary();
      const user = await createUser();
      const product = await createProduct();
      await deliveredOrder(user, [product]);

      const res = await submitWithPhoto(user, {
        productId: String(product._id),
        rating: 5,
        content: "With a photo",
        ...(consent !== undefined && { photoConsent: consent }),
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PHOTO_CONSENT_REQUIRED");
      expect(res.body.message).toMatch(/photos/i);
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(await Review.countDocuments()).toBe(0);
    },
  );

  it("POST /api/reviews returns only the submitter's own fields — no order/user ids, points or moderation data", async () => {
    const user = await createUser();
    const product = await createProduct();
    const order = await deliveredOrder(user, [product]);

    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: String(product._id), rating: 4, content: "Shape check" });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.review).sort()).toEqual(
      ["_id", "content", "createdAt", "isApproved", "photoConsent", "rating", "title"].sort(),
    );
    expect(res.body.review).toMatchObject({ rating: 4, content: "Shape check", isApproved: false, photoConsent: false });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(String(user._id));
    expect(body).not.toContain(String(order._id));
    for (const field of ["pointsAwarded", "reviewPointsProcessed", "isHidden", "hiddenReason", "adminReply", "isSeenByAdmin", "photoConsentAt"]) {
      expect(body).not.toContain(field);
    }
  });

  it("still accepts a text-only review without consent", async () => {
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product]);

    const res = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: String(product._id), rating: 4, content: "Just words" });

    expect(res.status).toBe(201);
    const saved = await Review.findById(res.body.review._id);
    expect(saved.photoConsent).toBe(false);
    expect(saved.photoConsentAt).toBeNull();
  });

  it("with consent, stores the photo and the consent time, and shows the photo publicly once approved", async () => {
    mockCloudinary();
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product]);

    const before = Date.now();
    const res = await submitWithPhoto(user, {
      productId: String(product._id),
      rating: 5,
      content: "Here it is",
      photoConsent: "true",
    });

    expect(res.status).toBe(201);
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    const saved = await Review.findById(res.body.review._id);
    expect(saved.photoConsent).toBe(true);
    expect(saved.photoConsentAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.images).toEqual([PHOTO_URL]);

    await Review.updateOne({ _id: saved._id }, { isApproved: true });

    const productRes = await request(app).get(`/api/reviews/product/${product._id}`);
    expect(productRes.body.reviews[0].images).toEqual([PHOTO_URL]);

    const showcase = await request(app).get("/api/reviews/showcase");
    expect(showcase.body.reviews.map((r) => r._id)).toEqual([String(saved._id)]);
    expect(showcase.body.reviews[0].images).toEqual([PHOTO_URL]);
  });

  it("legacy reviews without consent: photos/video hidden publicly, kept and visible to the admin", async () => {
    const seeded = await seedSensitiveReview({ photoConsent: false });
    // A true legacy document: no photoConsent field at all.
    await Review.collection.updateOne({ _id: seeded.reviewId }, { $unset: { photoConsent: "", photoConsentAt: "" } });

    const productRes = await request(app).get(`/api/reviews/product/${seeded.product._id}`);
    expect(productRes.body.reviews).toHaveLength(1);
    expect(productRes.body.reviews[0].images).toEqual([]);
    expect(productRes.body.reviews[0].video).toBe("");
    expect(JSON.stringify(productRes.body)).not.toContain(PHOTO_URL);
    expect(JSON.stringify(productRes.body)).not.toContain(VIDEO_URL);

    const showcase = await request(app).get("/api/reviews/showcase");
    expect(showcase.body.reviews).toHaveLength(0);

    const adminRes = await request(app)
      .get("/api/reviews/admin")
      .set("Authorization", `Bearer ${signToken(seeded.admin)}`);
    expect(adminRes.status).toBe(200);
    const adminReview = adminRes.body.reviews.find((r) => r._id === String(seeded.reviewId));
    expect(adminReview.images).toEqual([PHOTO_URL]);
    expect(adminReview.video).toBe(VIDEO_URL);

    // Nothing was deleted from the stored review.
    const stored = await Review.findById(seeded.reviewId);
    expect(stored.images).toEqual([PHOTO_URL]);
    expect(stored.video).toBe(VIDEO_URL);
  });

  it("toPublicReview drops media unless photoConsent is exactly true", () => {
    const base = { _id: new mongoose.Types.ObjectId(), rating: 5, content: "x", images: [PHOTO_URL], video: VIDEO_URL };

    expect(toPublicReview({ ...base, photoConsent: true }).images).toEqual([PHOTO_URL]);
    expect(toPublicReview({ ...base, photoConsent: "true" }).images).toEqual([]);
    expect(toPublicReview({ ...base }).images).toEqual([]);
    expect(toPublicReview({ ...base }).video).toBe("");
  });
});
