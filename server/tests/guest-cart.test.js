import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import CartSnapshot from "../models/CartSnapshot.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const cartItem = (product) => ({
  product: product._id.toString(),
  name: product.name,
  image: product.image,
  price: product.price,
  quantity: 1,
});

describe("POST /api/cart/sync-guest", () => {
  it("requires a visitorId", async () => {
    const res = await request(app).post("/api/cart/sync-guest").send({ items: [] });
    expect(res.status).toBe(400);
  });

  // Regression test: CartSnapshot.user/visitorId are sparse-unique so
  // more than one null/absent value can coexist — but Mongoose's
  // findOneAndUpdate defaults setDefaultsOnInsert to true, which used to
  // explicitly write the *other* field's schema default (null) on every
  // new snapshot. An explicit null is a real indexed value under a
  // sparse index (unlike a genuinely absent field), so the second ever
  // guest cart sync failed with a duplicate-key error on { user: null }.
  it("allows more than one guest cart to exist at once", async () => {
    const product = await createProduct();

    const first = await request(app)
      .post("/api/cart/sync-guest")
      .send({ visitorId: "guest-a", items: [cartItem(product)] });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    const second = await request(app)
      .post("/api/cart/sync-guest")
      .send({ visitorId: "guest-b", items: [cartItem(product)] });
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);

    const snapshots = await CartSnapshot.find({
      visitorId: { $in: ["guest-a", "guest-b"] },
    });
    expect(snapshots).toHaveLength(2);
    // Genuinely absent, not null — see CartSnapshot.js's comment on why
    // that distinction is what makes the sparse index actually work.
    snapshots.forEach((s) => expect(s.user).toBeUndefined());
  });

  it("does not collide with a logged-in user's own cart sync", async () => {
    const user = await createUser();
    const product = await createProduct();

    const userSync = await request(app)
      .post("/api/cart/sync")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ items: [cartItem(product)] });
    expect(userSync.status).toBe(200);

    const guestSync = await request(app)
      .post("/api/cart/sync-guest")
      .send({ visitorId: "guest-c", items: [cartItem(product)] });
    expect(guestSync.status).toBe(200);

    const userSnapshot = await CartSnapshot.findOne({ user: user._id });
    expect(userSnapshot.visitorId).toBeUndefined();

    const guestSnapshot = await CartSnapshot.findOne({ visitorId: "guest-c" });
    expect(guestSnapshot.user).toBeUndefined();
  });

  it("removes the guest snapshot once the cart is emptied", async () => {
    const product = await createProduct();

    await request(app)
      .post("/api/cart/sync-guest")
      .send({ visitorId: "guest-d", items: [cartItem(product)] });
    expect(await CartSnapshot.findOne({ visitorId: "guest-d" })).toBeTruthy();

    await request(app)
      .post("/api/cart/sync-guest")
      .send({ visitorId: "guest-d", items: [] });
    expect(await CartSnapshot.findOne({ visitorId: "guest-d" })).toBeNull();
  });
});
