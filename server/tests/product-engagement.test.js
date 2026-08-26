import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import PageVisit from "../models/PageVisit.js";
import Wishlist from "../models/Wishlist.js";
import CartSnapshot from "../models/CartSnapshot.js";
import { createUser, signToken, createProduct } from "./helpers.js";

describe("GET /api/analytics/product-views/:id", () => {
  it("counts a visit to the real /product/:id/:slug URL, not just a bare /product/:id", async () => {
    const product = await createProduct();

    // Real traffic always includes the slug (see productUrl.js) — a
    // bare-id visit is the rare exception, not the norm.
    await PageVisit.create({
      path: `/product/${product._id}/some-descriptive-slug`,
      visitorId: "visitor-a",
    });

    const res = await request(app).get(
      `/api/analytics/product-views/${product._id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe("GET /api/admin/product-engagement", () => {
  it("requires an admin token", async () => {
    const res = await request(app).get("/api/admin/product-engagement");
    expect(res.status).toBe(401);
  });

  it("reports views (regardless of slug), wishlist count, and cart count per product", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({ name: "Engaged Product" });
    const untouchedProduct = await createProduct({ name: "Untouched Product" });

    // Two different visitors, one of whom visited a slugged URL and the
    // other a bare-id URL — both must still count toward the same product.
    await PageVisit.create({
      path: `/product/${product._id}/some-slug`,
      visitorId: "visitor-a",
    });
    await PageVisit.create({
      path: `/product/${product._id}`,
      visitorId: "visitor-b",
    });
    // Same visitor viewing twice — counts as 2 views but 1 unique viewer.
    await PageVisit.create({
      path: `/product/${product._id}/some-slug`,
      visitorId: "visitor-a",
    });

    const wishlistUser = await createUser();
    await Wishlist.create({
      user: wishlistUser._id,
      product: product._id,
      priceWhenAdded: product.price,
    });

    const cartUser = await createUser();
    await CartSnapshot.create({
      user: cartUser._id,
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

    const res = await request(app)
      .get("/api/admin/product-engagement")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);

    const row = res.body.engagement.find(
      (e) => e.productId === product._id.toString(),
    );
    expect(row.views).toBe(3);
    expect(row.uniqueViewers).toBe(2);
    expect(row.wishlistCount).toBe(1);
    expect(row.cartCount).toBe(1);

    const untouchedRow = res.body.engagement.find(
      (e) => e.productId === untouchedProduct._id.toString(),
    );
    expect(untouchedRow.views).toBe(0);
    expect(untouchedRow.wishlistCount).toBe(0);
    expect(untouchedRow.cartCount).toBe(0);
  });

  it("drops a product's cart count once the cart is emptied", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const user = await createUser();

    const snapshot = await CartSnapshot.create({
      user: user._id,
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
    await CartSnapshot.findByIdAndDelete(snapshot._id); // mirrors syncCart's empty-cart delete

    const res = await request(app)
      .get("/api/admin/product-engagement")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    const row = res.body.engagement.find(
      (e) => e.productId === product._id.toString(),
    );
    expect(row.cartCount).toBe(0);
  });
});

describe("GET /api/admin/product-engagement/:productId/wishlist-users", () => {
  it("requires an admin token", async () => {
    const product = await createProduct();
    const res = await request(app).get(
      `/api/admin/product-engagement/${product._id}/wishlist-users`,
    );
    expect(res.status).toBe(401);
  });

  it("lists who has the product wishlisted, with contact details and the add date", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const otherProduct = await createProduct();
    const wisher = await createUser({
      name: "Priya Sharma",
      email: "priya@example.com",
      mobile: "9111111111",
    });
    const uninvolvedUser = await createUser();

    await Wishlist.create({
      user: wisher._id,
      product: product._id,
      priceWhenAdded: product.price,
    });
    // Different product — must not show up in this product's list.
    await Wishlist.create({
      user: uninvolvedUser._id,
      product: otherProduct._id,
      priceWhenAdded: otherProduct.price,
    });

    const res = await request(app)
      .get(`/api/admin/product-engagement/${product._id}/wishlist-users`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).toMatchObject({
      name: "Priya Sharma",
      email: "priya@example.com",
      mobile: "9111111111",
    });
    expect(res.body.users[0].addedAt).toBeTruthy();
  });
});

describe("GET /api/admin/product-engagement/:productId/cart-users", () => {
  it("requires an admin token", async () => {
    const product = await createProduct();
    const res = await request(app).get(
      `/api/admin/product-engagement/${product._id}/cart-users`,
    );
    expect(res.status).toBe(401);
  });

  it("lists who currently has the product in their cart, with contact details", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const otherProduct = await createProduct();
    const cartOwner = await createUser({
      name: "Rahul Verma",
      email: "rahul@example.com",
      mobile: "9222222222",
    });
    const uninvolvedUser = await createUser();

    await CartSnapshot.create({
      user: cartOwner._id,
      items: [
        {
          product: product._id,
          name: product.name,
          image: product.image,
          price: product.price,
          quantity: 2,
        },
      ],
    });
    // Different product only — must not show up in this product's list.
    await CartSnapshot.create({
      user: uninvolvedUser._id,
      items: [
        {
          product: otherProduct._id,
          name: otherProduct.name,
          image: otherProduct.image,
          price: otherProduct.price,
          quantity: 1,
        },
      ],
    });

    const res = await request(app)
      .get(`/api/admin/product-engagement/${product._id}/cart-users`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).toMatchObject({
      name: "Rahul Verma",
      email: "rahul@example.com",
      mobile: "9222222222",
    });
    expect(res.body.users[0].lastSyncedAt).toBeTruthy();
  });

  it("counts a guest's cart and lists them as a placeholder, not dropped", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();

    await CartSnapshot.create({
      visitorId: "guest-engagement-test",
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

    const engagementRes = await request(app)
      .get("/api/admin/product-engagement")
      .set("Authorization", `Bearer ${signToken(admin)}`);
    const row = engagementRes.body.engagement.find(
      (e) => e.productId === product._id.toString(),
    );
    expect(row.cartCount).toBe(1);

    const usersRes = await request(app)
      .get(`/api/admin/product-engagement/${product._id}/cart-users`)
      .set("Authorization", `Bearer ${signToken(admin)}`);
    expect(usersRes.body.users).toHaveLength(1);
    expect(usersRes.body.users[0].name).toBe("Guest (not logged in)");
    expect(usersRes.body.users[0].email).toBeNull();
  });
});
