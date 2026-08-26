import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import User from "../models/User.js";
import Review from "../models/Review.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";
import { REVIEW_BONUS_POINTS, ORDER_REVIEW_BONUS_CAP } from "../controllers/reviewController.js";

describe("Reviews", () => {
  it("blocks a second review from the same user on the same product", async () => {
    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct();

    const first = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product._id.toString(), rating: 5, title: "Great", content: "Loved it" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product._id.toString(), rating: 1, title: "Again", content: "Trying twice" });
    expect(second.status).toBe(400);
  });

  it("hides unapproved reviews from the public endpoint and excludes them from the average rating", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();

    const reviewA = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(userA)}`)
      .send({ productId: product._id.toString(), rating: 5, title: "A", content: "Five stars" });

    await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(userB)}`)
      .send({ productId: product._id.toString(), rating: 1, title: "B", content: "One star" });

    // Nothing is approved yet — public endpoint should show nothing.
    let publicRes = await request(app).get(`/api/reviews/product/${product._id}`);
    expect(publicRes.body.totalReviews).toBe(0);

    // Approve only the 5-star review.
    await request(app)
      .put(`/api/reviews/${reviewA.body.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    publicRes = await request(app).get(`/api/reviews/product/${product._id}`);
    expect(publicRes.body.totalReviews).toBe(1);
    expect(publicRes.body.averageRating).toBe(5); // the 1-star unapproved review must not drag this down
  });

  it("credits the review bonus once a review is approved", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    await createOrder({ user, products: [product] });

    const submitted = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString(), rating: 5, title: "Great", content: "Loved it" });

    const beforeApproval = await User.findById(user._id);
    expect(beforeApproval.loyaltyPoints).toBe(0);

    await request(app)
      .put(`/api/reviews/${submitted.body.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    const afterApproval = await User.findById(user._id);
    expect(afterApproval.loyaltyPoints).toBe(REVIEW_BONUS_POINTS);
  });

  it("does not double-credit the review bonus if the same review is approved twice", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const product = await createProduct();
    await createOrder({ user, products: [product] });

    const submitted = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString(), rating: 5, title: "Great", content: "Loved it" });

    await request(app)
      .put(`/api/reviews/${submitted.body.review._id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    await request(app)
      .put(`/api/reviews/${submitted.body.review._id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    const user2 = await User.findById(user._id);
    expect(user2.loyaltyPoints).toBe(REVIEW_BONUS_POINTS);
  });

  it("awards no bonus for a review with no matching Delivered order (no verified purchase)", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();

    const submitted = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString(), rating: 5, content: "Looks nice in photos" });

    expect(submitted.body.review.order).toBeFalsy();

    const res = await request(app)
      .put(`/api/reviews/${submitted.body.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.review.isApproved).toBe(true); // still approved/shown, just no bonus

    const afterApproval = await User.findById(user._id);
    expect(afterApproval.loyaltyPoints).toBe(0);
  });

  it("caps the combined review bonus at the per-order limit across multiple products from the same order", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const productA = await createProduct({ name: "Product A" });
    const productB = await createProduct({ name: "Product B" });

    await createOrder({ user, products: [productA, productB] });

    const reviewA = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: productA._id.toString(), rating: 5, content: "Loved it" });
    const reviewB = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: productB._id.toString(), rating: 4, content: "Pretty good" });

    expect(reviewA.body.review.order).toBeTruthy();
    expect(reviewB.body.review.order).toBe(reviewA.body.review.order);

    await request(app)
      .put(`/api/reviews/${reviewA.body.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(admin)}`);
    await request(app)
      .put(`/api/reviews/${reviewB.body.review._id}/approve`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    const afterBoth = await User.findById(user._id);
    expect(afterBoth.loyaltyPoints).toBe(ORDER_REVIEW_BONUS_CAP);
  });

  it("still respects the per-order cap when two reviews on the same order are approved concurrently", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const productA = await createProduct({ name: "Product A" });
    const productB = await createProduct({ name: "Product B" });

    await createOrder({ user, products: [productA, productB] });

    const reviewA = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: productA._id.toString(), rating: 5, content: "Loved it" });
    const reviewB = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: productB._id.toString(), rating: 4, content: "Pretty good" });

    // Fire both approvals at once instead of awaiting one before the
    // other, to actually exercise the race instead of just testing the
    // already-sequential-safe path.
    await Promise.all([
      request(app)
        .put(`/api/reviews/${reviewA.body.review._id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`),
      request(app)
        .put(`/api/reviews/${reviewB.body.review._id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`),
    ]);

    const afterBoth = await User.findById(user._id);
    expect(afterBoth.loyaltyPoints).toBe(ORDER_REVIEW_BONUS_CAP);

    const [savedA, savedB] = await Promise.all([
      Review.findById(reviewA.body.review._id),
      Review.findById(reviewB.body.review._id),
    ]);
    expect(savedA.pointsAwarded + savedB.pointsAwarded).toBe(ORDER_REVIEW_BONUS_CAP);
  });

  it("claws back points and frees cap headroom when an approved review is deleted", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const product = await createProduct();
    await createOrder({ user, products: [product] });

    const submitted = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString(), rating: 5, content: "Loved it" });

    await request(app)
      .put(`/api/reviews/${submitted.body.review._id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    const afterApproval = await User.findById(user._id);
    expect(afterApproval.loyaltyPoints).toBe(REVIEW_BONUS_POINTS);

    await request(app)
      .delete(`/api/reviews/${submitted.body.review._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const afterDelete = await User.findById(user._id);
    expect(afterDelete.loyaltyPoints).toBe(0);
  });

  it("doesn't let delete-then-resubmit push a user over the per-order cap", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const productA = await createProduct({ name: "Product A" });
    const productB = await createProduct({ name: "Product B" });

    await createOrder({ user, products: [productA, productB] });

    const reviewA = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: productA._id.toString(), rating: 5, content: "Loved it" });
    const reviewB = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: productB._id.toString(), rating: 4, content: "Pretty good" });

    await request(app)
      .put(`/api/reviews/${reviewA.body.review._id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    await request(app)
      .put(`/api/reviews/${reviewB.body.review._id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    const afterBoth = await User.findById(user._id);
    expect(afterBoth.loyaltyPoints).toBe(ORDER_REVIEW_BONUS_CAP);

    // Reject/delete reviewA as spam, then the user resubmits and it gets
    // approved again — the resubmission should get its fair share of the
    // now-freed cap headroom, and the total must never exceed the cap.
    await request(app)
      .delete(`/api/reviews/${reviewA.body.review._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const resubmitted = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: productA._id.toString(), rating: 5, content: "Still loved it" });

    await request(app)
      .put(`/api/reviews/${resubmitted.body.review._id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    const final = await User.findById(user._id);
    expect(final.loyaltyPoints).toBeLessThanOrEqual(ORDER_REVIEW_BONUS_CAP);
    expect(final.loyaltyPoints).toBe(ORDER_REVIEW_BONUS_CAP);
  });

  it("showcase endpoint only returns approved reviews that have photos", async () => {
    const user = await createUser();
    const product = await createProduct();

    const approvedWithPhoto = await Review.create({
      product: product._id,
      user: user._id,
      rating: 5,
      content: "Beautiful in person",
      images: ["https://res.cloudinary.com/demo/image/upload/photo1.jpg"],
      isApproved: true,
    });
    await Review.create({
      product: product._id,
      user: user._id,
      rating: 4,
      content: "No photo attached",
      isApproved: true,
    });
    await Review.create({
      product: product._id,
      user: user._id,
      rating: 5,
      content: "Great but not approved yet",
      images: ["https://res.cloudinary.com/demo/image/upload/photo2.jpg"],
      isApproved: false,
    });

    const res = await request(app).get("/api/reviews/showcase");

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0]._id).toBe(approvedWithPhoto._id.toString());
  });

  it("does not require a review title", async () => {
    const user = await createUser();
    const product = await createProduct();

    const submitted = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString(), rating: 5, content: "Loved it" });

    expect(submitted.status).toBe(201);
    expect(submitted.body.review.title).toBe("");
  });
});

describe("Questions", () => {
  it("does not publish a question until an admin answers it", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();

    const submitted = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString(), question: "Is this machine washable?" });
    const questionId = submitted.body.question._id;

    let publicRes = await request(app).get(`/api/questions/product/${product._id}`);
    expect(publicRes.body.questions).toHaveLength(0);

    await request(app)
      .put(`/api/questions/${questionId}/answer`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ answer: "Yes, cold wash recommended." });

    publicRes = await request(app).get(`/api/questions/product/${product._id}`);
    expect(publicRes.body.questions).toHaveLength(1);
    expect(publicRes.body.questions[0].answer).toBe("Yes, cold wash recommended.");
  });

  it("does not auto-publish when isPublished is left unset and the answer is blank", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();

    const submitted = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString(), question: "Any discount on bulk?" });

    // Admin saves without actually answering yet (e.g. just opened and closed the form).
    await request(app)
      .put(`/api/questions/${submitted.body.question._id}/answer`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({});

    const publicRes = await request(app).get(`/api/questions/product/${product._id}`);
    expect(publicRes.body.questions).toHaveLength(0);
  });
});
