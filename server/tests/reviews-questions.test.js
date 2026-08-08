import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import { createUser, signToken, createProduct } from "./helpers.js";

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
