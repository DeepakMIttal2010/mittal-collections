import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import { createUser, signToken, createProduct } from "./helpers.js";

describe("Wishlist", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/wishlist");
    expect(res.status).toBe(401);
  });

  it("adds a product, prevents duplicates, and removes it", async () => {
    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct();

    const add1 = await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product._id.toString() });
    expect(add1.status).toBe(201);

    const add2 = await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product._id.toString() });
    expect(add2.status).toBe(400);

    const list = await request(app)
      .get("/api/wishlist")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.wishlist).toHaveLength(1);

    const remove = await request(app)
      .delete(`/api/wishlist/${product._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(remove.status).toBe(200);

    const listAfter = await request(app)
      .get("/api/wishlist")
      .set("Authorization", `Bearer ${token}`);
    expect(listAfter.body.wishlist).toHaveLength(0);
  });

  it("clears the whole wishlist without touching another user's", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const token = signToken(user);
    const otherToken = signToken(otherUser);
    const productA = await createProduct();
    const productB = await createProduct();

    await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: productA._id.toString() });
    await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: productB._id.toString() });
    await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ productId: productA._id.toString() });

    await request(app)
      .delete("/api/wishlist")
      .set("Authorization", `Bearer ${token}`);

    const mine = await request(app)
      .get("/api/wishlist")
      .set("Authorization", `Bearer ${token}`);
    expect(mine.body.wishlist).toHaveLength(0);

    const theirs = await request(app)
      .get("/api/wishlist")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(theirs.body.wishlist).toHaveLength(1);
  });
});
