import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import request from "supertest";
import sharp from "sharp";

import "./setup.js";
import cloudinary from "../config/cloudinary.js";
import Review from "../models/Review.js";
import ReturnRequest from "../models/ReturnRequest.js";
import User from "../models/User.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { REVIEW_BONUS_POINTS } from "../controllers/reviewController.js";

// This file posts well over uploadLimiter's 30-per-minute review
// submissions (server/middleware/uploadLimiter.js), which reads
// DISABLE_AUTH_RATE_LIMIT at module load — so app.js is imported only
// after setting it, same as auth-registration.test.js. Never set in
// production.
let app;
beforeAll(async () => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  ({ default: app } = await import("../app.js"));
}, 120000);

const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

const submit = (user, body) =>
  request(app)
    .post("/api/reviews")
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send(body);

const eligibility = (user, productId) =>
  request(app)
    .get(`/api/reviews/eligibility/${productId}`)
    .set("Authorization", `Bearer ${signToken(user)}`);

// A realistic delivered order: deliveredAt + statusHistory, the way
// updateOrderStatus actually leaves one.
const deliveredOrder = (user, products, overrides = {}) =>
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
      ...overrides,
    },
  });

describe("Review eligibility — who can submit", () => {
  it("accepts a review from a delivered prepaid (Razorpay, paid) order and links it", async () => {
    const user = await createUser();
    const product = await createProduct();
    const order = await deliveredOrder(user, [product], { paymentMethod: "Razorpay", isPaid: true });

    const res = await submit(user, { productId: product._id.toString(), rating: 5, content: "Lovely" });

    expect(res.status).toBe(201);
    expect(res.body.review.order).toBe(order._id.toString());
  });

  it("accepts a review from a delivered COD order even though isPaid is still false", async () => {
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product], { paymentMethod: "COD", isPaid: false });

    const res = await submit(user, { productId: product._id.toString(), rating: 4, content: "Good" });

    expect(res.status).toBe(201);
  });

  it("rejects a customer who never bought the product, and stores nothing", async () => {
    const user = await createUser();
    const product = await createProduct();

    const res = await submit(user, { productId: product._id.toString(), rating: 5, content: "Looks nice" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NOT_ELIGIBLE");
    expect(await Review.countDocuments()).toBe(0);
  });

  it.each(["Pending", "Processing", "Shipped"])("rejects a %s (not yet delivered) order", async (status) => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder({
      user,
      products: [product],
      overrides: { orderStatus: status, statusHistory: [{ status: "Pending" }] },
    });

    const res = await submit(user, { productId: product._id.toString(), rating: 5, content: "Waiting" });

    expect(res.status).toBe(403);
  });

  it("rejects an order cancelled before delivery (incl. RTO, recorded as Cancelled)", async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder({
      user,
      products: [product],
      overrides: {
        orderStatus: "Cancelled",
        statusHistory: [{ status: "Pending" }, { status: "Shipped" }, { status: "Cancelled" }],
      },
    });

    const res = await submit(user, { productId: product._id.toString(), rating: 1, content: "Never came" });

    expect(res.status).toBe(403);
  });

  it("still accepts a review after a full return (delivered, then the order was cancelled)", async () => {
    const user = await createUser();
    const product = await createProduct();
    const order = await deliveredOrder(user, [product], { orderStatus: "Cancelled" });

    const res = await submit(user, { productId: product._id.toString(), rating: 2, content: "Sent it back" });

    expect(res.status).toBe(201);
    expect(res.body.review.order).toBe(order._id.toString());
  });

  it("still accepts a review of an item returned in a partial return", async () => {
    const user = await createUser();
    const returned = await createProduct({ name: "Returned sheet" });
    const kept = await createProduct({ name: "Kept towel" });
    const order = await deliveredOrder(user, [returned, kept]);
    await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: returned._id,
      productName: returned.name,
      quantity: 1,
      reason: "Colour differs",
      status: "Refunded",
    });

    const res = await submit(user, { productId: returned._id.toString(), rating: 2, content: "Colour differs" });

    expect(res.status).toBe(201);
  });

  it("accepts an older order whose delivery is only in statusHistory", async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder({
      user,
      products: [product],
      overrides: {
        orderStatus: "Cancelled",
        statusHistory: [{ status: "Delivered" }, { status: "Cancelled" }],
      },
    });

    const res = await submit(user, { productId: product._id.toString(), rating: 3, content: "OK" });

    expect(res.status).toBe(201);
  });

  it("does not count someone else's delivered order", async () => {
    const buyer = await createUser();
    const other = await createUser();
    const product = await createProduct();
    await deliveredOrder(buyer, [product]);

    const res = await submit(other, { productId: product._id.toString(), rating: 5, content: "Borrowed" });

    expect(res.status).toBe(403);
  });

  it("does not count a soft-deleted order", async () => {
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product], { orderStatus: "Cancelled", isActive: false });

    const res = await submit(user, { productId: product._id.toString(), rating: 5, content: "Deleted" });

    expect(res.status).toBe(403);
  });

  it("accepts a genuine 1-star review from a buyer", async () => {
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product]);

    const res = await submit(user, { productId: product._id.toString(), rating: 1, content: "Poor stitching" });

    expect(res.status).toBe(201);
    expect(res.body.review.rating).toBe(1);
  });

  it("gives a returned item's review the same bonus rules once approved", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    await deliveredOrder(user, [product], { orderStatus: "Cancelled" });

    const res = await submit(user, { productId: product._id.toString(), rating: 1, content: "Returned it" });
    await request(app)
      .put(`/api/reviews/${res.body.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    const after = await User.findById(user._id);
    expect(after.loyaltyPoints).toBe(REVIEW_BONUS_POINTS);
  });
});

describe("Review eligibility — input rules", () => {
  const buyerWithProduct = async () => {
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product]);
    return { user, productId: product._id.toString() };
  };

  it.each([4.5, "4.5", 0, "0", 6, "6", "abc", ["4"], -1])("rejects rating %j", async (rating) => {
    const { user, productId } = await buyerWithProduct();

    const res = await submit(user, { productId, rating, content: "Fine" });

    expect(res.status).toBe(400);
    expect(await Review.countDocuments()).toBe(0);
  });

  it("accepts a whole-number rating sent as a string (multipart) and stores it as a number", async () => {
    const { user, productId } = await buyerWithProduct();

    const res = await submit(user, { productId, rating: "3", content: "Average" });

    expect(res.status).toBe(201);
    expect(res.body.review.rating).toBe(3);
  });

  it("accepts exactly 2000 characters and rejects 2001", async () => {
    const { user, productId } = await buyerWithProduct();

    const tooLong = await submit(user, { productId, rating: 4, content: "a".repeat(2001) });
    expect(tooLong.status).toBe(400);

    const atLimit = await submit(user, { productId, rating: 4, content: "a".repeat(2000) });
    expect(atLimit.status).toBe(201);
  });

  it("rejects whitespace-only or non-text content", async () => {
    const { user, productId } = await buyerWithProduct();

    expect((await submit(user, { productId, rating: 4, content: "   " })).status).toBe(400);
    expect((await submit(user, { productId, rating: 4, content: { $gt: "" } })).status).toBe(400);
  });

  it("keeps only one review when the same buyer submits twice at once", async () => {
    const { user, productId } = await buyerWithProduct();

    const results = await Promise.all([
      submit(user, { productId, rating: 5, content: "First tab" }),
      submit(user, { productId, rating: 1, content: "Second tab" }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await Review.countDocuments()).toBe(1);
  });

  it("leaves existing order-less reviews untouched and still public", async () => {
    const legacyUser = await createUser();
    const { user, productId } = await buyerWithProduct();
    const legacy = await Review.create({
      product: productId,
      user: legacyUser._id,
      rating: 4,
      content: "Written before verified purchases were required",
      isApproved: true,
    });

    const res = await submit(user, { productId, rating: 5, content: "New verified one" });
    expect(res.status).toBe(201);

    const stillThere = await Review.findById(legacy._id).lean();
    expect(stillThere.order).toBeNull();
    expect(stillThere.content).toBe(legacy.content);

    const publicRes = await request(app).get(`/api/reviews/product/${productId}`);
    expect(publicRes.body.reviews.map((r) => r._id)).toContain(legacy._id.toString());
  });
});

describe("Review photo upload security", () => {
  let uploadSpy;
  let photo;

  beforeAll(async () => {
    photo = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .jpeg()
      .toBuffer();
  });

  // Stands in for Cloudinary: records every attempt to store a file.
  const mockCloudinary = () => {
    uploadSpy = vi.spyOn(cloudinary.uploader, "upload_stream").mockImplementation((options, callback) => ({
      end: () =>
        callback(null, {
          secure_url: "https://res.cloudinary.com/demo/image/upload/v1/mittal-collections/test-review.jpg",
          public_id: "mittal-collections/test-review",
        }),
    }));
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const submitWithPhoto = (req, fields) => {
    let r = req;
    for (const [key, value] of Object.entries(fields)) r = r.field(key, String(value));
    return r.attach("images", photo, { filename: "review.jpg", contentType: "image/jpeg" });
  };

  const postAs = (user) =>
    request(app).post("/api/reviews").set("Authorization", `Bearer ${signToken(user)}`);

  it("never uploads a photo for a customer who didn't buy the product", async () => {
    mockCloudinary();
    const user = await createUser();
    const product = await createProduct();

    const res = await submitWithPhoto(postAs(user), {
      productId: product._id.toString(),
      rating: 5,
      content: "Bypassing the page",
    });

    expect(res.status).toBe(403);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(await Review.countDocuments()).toBe(0);
  });

  it("never uploads a photo for a not-yet-delivered order", async () => {
    mockCloudinary();
    const user = await createUser();
    const product = await createProduct();
    await createOrder({
      user,
      products: [product],
      overrides: { orderStatus: "Shipped", statusHistory: [{ status: "Pending" }, { status: "Shipped" }] },
    });

    const res = await submitWithPhoto(postAs(user), {
      productId: product._id.toString(),
      rating: 4,
      content: "Not here yet",
    });

    expect(res.status).toBe(403);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("never uploads a photo for an invalid form or a second review", async () => {
    mockCloudinary();
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product]);
    const productId = product._id.toString();

    const badRating = await submitWithPhoto(postAs(user), { productId, rating: 4.5, content: "Half star" });
    const tooLong = await submitWithPhoto(postAs(user), { productId, rating: 4, content: "a".repeat(2001) });
    expect(badRating.status).toBe(400);
    expect(tooLong.status).toBe(400);

    await Review.create({ product: product._id, user: user._id, rating: 5, content: "Already here" });
    const second = await submitWithPhoto(postAs(user), { productId, rating: 3, content: "Again" });
    expect(second.status).toBe(400);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("never reaches the upload step without a login", async () => {
    mockCloudinary();
    const product = await createProduct();

    const res = await submitWithPhoto(request(app).post("/api/reviews"), {
      productId: product._id.toString(),
      rating: 5,
      content: "Anonymous",
    });

    expect(res.status).toBe(401);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("uploads and saves the photo for an eligible buyer", async () => {
    mockCloudinary();
    const user = await createUser();
    const product = await createProduct();
    await deliveredOrder(user, [product], { paymentMethod: "COD", isPaid: false });

    const res = await submitWithPhoto(postAs(user), {
      productId: product._id.toString(),
      rating: 5,
      content: "Here is how it looks",
    });

    expect(res.status).toBe(201);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(res.body.review.images).toEqual([
      "https://res.cloudinary.com/demo/image/upload/v1/mittal-collections/test-review.jpg",
    ]);
  });
});

describe("GET /api/reviews/eligibility/:productId", () => {
  it("requires login", async () => {
    const product = await createProduct();

    const res = await request(app).get(`/api/reviews/eligibility/${product._id}`);

    expect(res.status).toBe(401);
  });

  it("rejects an invalid product id", async () => {
    const user = await createUser();

    const res = await eligibility(user, "not-an-id");

    expect(res.status).toBe(400);
  });

  it("reports buyer, non-buyer and already-reviewed correctly", async () => {
    const buyer = await createUser();
    const stranger = await createUser();
    const product = await createProduct();
    await deliveredOrder(buyer, [product]);

    let res = await eligibility(buyer, product._id);
    expect(res.body).toMatchObject({ eligible: true, hasPurchased: true, alreadyReviewed: false });

    res = await eligibility(stranger, product._id);
    expect(res.body).toMatchObject({ eligible: false, hasPurchased: false, alreadyReviewed: false });

    await submit(buyer, { productId: product._id.toString(), rating: 5, content: "Done" });

    res = await eligibility(buyer, product._id);
    expect(res.body).toMatchObject({ eligible: false, hasPurchased: true, alreadyReviewed: true });
  });
});
