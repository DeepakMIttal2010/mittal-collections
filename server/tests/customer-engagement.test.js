import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import PageVisit from "../models/PageVisit.js";
import Wishlist from "../models/Wishlist.js";
import CartSnapshot from "../models/CartSnapshot.js";
import { createUser, signToken, createProduct } from "./helpers.js";

describe("POST /api/analytics/visit", () => {
  it("stores the logged-in visitor's user id when one is provided", async () => {
    const user = await createUser();

    const res = await request(app).post("/api/analytics/visit").send({
      path: "/product/abc123/some-slug",
      visitorId: "visitor-x",
      userId: user._id.toString(),
    });

    expect(res.status).toBe(201);

    const visit = await PageVisit.findOne({ visitorId: "visitor-x" });
    expect(visit.user.toString()).toBe(user._id.toString());
  });

  it("leaves user unset for an anonymous (logged-out) visit", async () => {
    const res = await request(app).post("/api/analytics/visit").send({
      path: "/",
      visitorId: "visitor-anon",
    });

    expect(res.status).toBe(201);

    const visit = await PageVisit.findOne({ visitorId: "visitor-anon" });
    expect(visit.user).toBeNull();
  });
});

describe("GET /api/admin/customers/:id — engagement data", () => {
  it("includes the customer's current wishlist, cart, and logged-in browsing history", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const product = await createProduct({ name: "Tracked Product" });

    await Wishlist.create({
      user: customer._id,
      product: product._id,
      priceWhenAdded: product.price,
    });

    await CartSnapshot.create({
      user: customer._id,
      items: [
        {
          product: product._id,
          name: product.name,
          image: product.image,
          price: product.price,
          quantity: 1,
        },
      ],
    });

    await PageVisit.create({
      path: `/product/${product._id}/tracked-product`,
      visitorId: "visitor-y",
      user: customer._id,
    });
    // A visit by someone else must not leak into this customer's history.
    const otherCustomer = await createUser();
    await PageVisit.create({
      path: "/",
      visitorId: "visitor-z",
      user: otherCustomer._id,
    });

    const res = await request(app)
      .get(`/api/admin/customers/${customer._id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.wishlistItems).toHaveLength(1);
    expect(res.body.wishlistItems[0].product.name).toBe("Tracked Product");
    expect(res.body.cartItems).toHaveLength(1);
    expect(res.body.cartItems[0].name).toBe("Tracked Product");
    expect(res.body.recentVisits).toHaveLength(1);
    expect(res.body.viewedAnyProduct).toBe(true);
  });

  it("reports viewedAnyProduct as false when the customer only visited non-product pages", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();

    await PageVisit.create({ path: "/", visitorId: "v1", user: customer._id });
    await PageVisit.create({
      path: "/category/bedsheets",
      visitorId: "v1",
      user: customer._id,
    });

    const res = await request(app)
      .get(`/api/admin/customers/${customer._id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.body.viewedAnyProduct).toBe(false);
    expect(res.body.recentVisits).toHaveLength(2);
  });
});
