import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Wishlist from "../models/Wishlist.js";
import { createUser, signToken, createProduct } from "./helpers.js";

describe("Guest wishlist", () => {
  it("adds a product, prevents duplicates, lists, and removes it — all without login", async () => {
    const product = await createProduct();
    const visitorId = "guest-wishlist-a";

    const add1 = await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId, productId: product._id.toString() });
    expect(add1.status).toBe(201);

    const add2 = await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId, productId: product._id.toString() });
    expect(add2.status).toBe(400);

    const list = await request(app).get(`/api/wishlist/guest/${visitorId}`);
    expect(list.body.wishlist).toHaveLength(1);

    const remove = await request(app).delete(
      `/api/wishlist/guest/${visitorId}/${product._id}`,
    );
    expect(remove.status).toBe(200);

    const listAfter = await request(app).get(`/api/wishlist/guest/${visitorId}`);
    expect(listAfter.body.wishlist).toHaveLength(0);
  });

  // Regression test mirroring the CartSnapshot bug: two different guests'
  // wishlist items must not collide on a shared sparse-index "absent
  // user" value.
  it("allows more than one guest's wishlist to exist at once", async () => {
    const productA = await createProduct();
    const productB = await createProduct();

    const first = await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId: "guest-wishlist-b", productId: productA._id.toString() });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId: "guest-wishlist-c", productId: productB._id.toString() });
    expect(second.status).toBe(201);

    const items = await Wishlist.find({
      visitorId: { $in: ["guest-wishlist-b", "guest-wishlist-c"] },
    });
    expect(items).toHaveLength(2);
    items.forEach((item) => expect(item.user).toBeUndefined());
  });

  it("does not collide with a logged-in user's own wishlist", async () => {
    const user = await createUser();
    const product = await createProduct();

    const userAdd = await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString() });
    expect(userAdd.status).toBe(201);

    const guestAdd = await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId: "guest-wishlist-d", productId: product._id.toString() });
    expect(guestAdd.status).toBe(201);
  });

  it("clears a guest wishlist without touching another guest's", async () => {
    const product = await createProduct();

    await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId: "guest-wishlist-e", productId: product._id.toString() });
    await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId: "guest-wishlist-f", productId: product._id.toString() });

    await request(app).delete("/api/wishlist/guest/guest-wishlist-e");

    const cleared = await request(app).get("/api/wishlist/guest/guest-wishlist-e");
    expect(cleared.body.wishlist).toHaveLength(0);

    const untouched = await request(app).get("/api/wishlist/guest/guest-wishlist-f");
    expect(untouched.body.wishlist).toHaveLength(1);
  });
});

describe("POST /api/wishlist/merge-guest", () => {
  it("requires an auth token", async () => {
    const res = await request(app)
      .post("/api/wishlist/merge-guest")
      .send({ visitorId: "guest-wishlist-g" });
    expect(res.status).toBe(401);
  });

  it("moves a guest's wishlist items onto the newly-logged-in account", async () => {
    const user = await createUser();
    const product = await createProduct();
    const visitorId = "guest-wishlist-h";

    await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId, productId: product._id.toString() });

    const res = await request(app)
      .post("/api/wishlist/merge-guest")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ visitorId });

    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(1);

    const userWishlist = await request(app)
      .get("/api/wishlist")
      .set("Authorization", `Bearer ${signToken(user)}`);
    expect(userWishlist.body.wishlist).toHaveLength(1);
    expect(
      userWishlist.body.wishlist[0].product._id.toString(),
    ).toBe(product._id.toString());

    // The guest copy is gone, not just duplicated.
    const guestWishlist = await request(app).get(
      `/api/wishlist/guest/${visitorId}`,
    );
    expect(guestWishlist.body.wishlist).toHaveLength(0);
  });

  it("drops the guest copy instead of erroring when the account already has that product", async () => {
    const user = await createUser();
    const product = await createProduct();
    const visitorId = "guest-wishlist-i";

    await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: product._id.toString() });

    await request(app)
      .post("/api/wishlist/guest")
      .send({ visitorId, productId: product._id.toString() });

    const res = await request(app)
      .post("/api/wishlist/merge-guest")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ visitorId });

    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(0);

    const userWishlist = await request(app)
      .get("/api/wishlist")
      .set("Authorization", `Bearer ${signToken(user)}`);
    expect(userWishlist.body.wishlist).toHaveLength(1); // not duplicated
  });

  it("is a harmless no-op when the visitor never wishlisted anything as a guest", async () => {
    const user = await createUser();

    const res = await request(app)
      .post("/api/wishlist/merge-guest")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ visitorId: "guest-wishlist-never-used" });

    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(0);
  });
});
