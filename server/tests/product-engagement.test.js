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

  it("scopes views to a startDate/endDate range while leaving wishlist/cart counts as current-state", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();

    const wishlistUser = await createUser();
    await Wishlist.create({
      user: wishlistUser._id,
      product: product._id,
      priceWhenAdded: product.price,
    });

    // One visit "yesterday", two visits "today" — a range covering only
    // yesterday should report just the one.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().slice(0, 10);

    await PageVisit.create({
      path: `/product/${product._id}`,
      visitorId: "visitor-yesterday",
      createdAt: yesterday,
    });
    await PageVisit.create({
      path: `/product/${product._id}`,
      visitorId: "visitor-today-a",
    });
    await PageVisit.create({
      path: `/product/${product._id}`,
      visitorId: "visitor-today-b",
    });

    const res = await request(app)
      .get(
        `/api/admin/product-engagement?startDate=${yesterdayISO}&endDate=${yesterdayISO}`,
      )
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);

    const row = res.body.engagement.find(
      (e) => e.productId === product._id.toString(),
    );
    expect(row.views).toBe(1);
    expect(row.uniqueViewers).toBe(1);
    // Unaffected by the views date filter — still the live count.
    expect(row.wishlistCount).toBe(1);
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

  it("counts a guest's wishlist item and lists them as a placeholder, not dropped", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();

    await Wishlist.create({
      visitorId: "guest-engagement-wishlist-test",
      product: product._id,
      priceWhenAdded: product.price,
    });

    const engagementRes = await request(app)
      .get("/api/admin/product-engagement")
      .set("Authorization", `Bearer ${signToken(admin)}`);
    const row = engagementRes.body.engagement.find(
      (e) => e.productId === product._id.toString(),
    );
    expect(row.wishlistCount).toBe(1);

    const usersRes = await request(app)
      .get(`/api/admin/product-engagement/${product._id}/wishlist-users`)
      .set("Authorization", `Bearer ${signToken(admin)}`);
    expect(usersRes.body.users).toHaveLength(1);
    expect(usersRes.body.users[0].name).toBe("Guest (not logged in)");
    expect(usersRes.body.users[0].email).toBeNull();
  });
});

describe("GET /api/admin/product-engagement/:productId/view-users", () => {
  it("requires an admin token", async () => {
    const product = await createProduct();
    const res = await request(app).get(
      `/api/admin/product-engagement/${product._id}/view-users`,
    );
    expect(res.status).toBe(401);
  });

  it("lists both logged-in and guest visitors, deduped per visitorId", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const loggedInViewer = await createUser({ name: "Anjali Gupta" });

    // Same logged-in person, two visits — should collapse to one row.
    await PageVisit.create({
      path: `/product/${product._id}/some-slug`,
      visitorId: "visitor-1",
      user: loggedInViewer._id,
    });
    await PageVisit.create({
      path: `/product/${product._id}`,
      visitorId: "visitor-1",
      user: loggedInViewer._id,
    });
    // An anonymous visit to the same product — now shown as a guest row.
    await PageVisit.create({
      path: `/product/${product._id}/some-slug`,
      visitorId: "visitor-2",
    });

    const res = await request(app)
      .get(`/api/admin/product-engagement/${product._id}/view-users`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    const names = res.body.users.map((u) => u.name).sort();
    expect(names).toEqual(["Anjali Gupta", "Guest (not logged in)"]);
  });

  it("scopes the viewer list to a startDate/endDate range when given", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const oldViewer = await createUser({ name: "Old Viewer" });
    const recentViewer = await createUser({ name: "Recent Viewer" });

    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);

    await PageVisit.create({
      path: `/product/${product._id}`,
      visitorId: "visitor-old",
      user: oldViewer._id,
      createdAt: lastMonth,
    });
    await PageVisit.create({
      path: `/product/${product._id}`,
      visitorId: "visitor-recent",
      user: recentViewer._id,
    });

    const since = new Date();
    since.setDate(since.getDate() - 1);

    const res = await request(app)
      .get(
        `/api/admin/product-engagement/${product._id}/view-users?startDate=${since.toISOString().slice(0, 10)}`,
      )
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].name).toBe("Recent Viewer");
  });
});

describe("GET /api/admin/product-engagement/details", () => {
  it("requires an admin token", async () => {
    const res = await request(app).get("/api/admin/product-engagement/details");
    expect(res.status).toBe(401);
  });

  it("flattens every wishlist and cart row across every product, including guests", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({ name: "Detail Export Product" });
    const wisher = await createUser({ name: "Kavita Rao" });

    await Wishlist.create({
      user: wisher._id,
      product: product._id,
      priceWhenAdded: product.price,
    });
    await CartSnapshot.create({
      visitorId: "guest-details-export",
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
      .get("/api/admin/product-engagement/details")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);

    const wishlistRow = res.body.rows.find(
      (r) => r.type === "Wishlist" && r.product === "Detail Export Product",
    );
    expect(wishlistRow.name).toBe("Kavita Rao");

    const cartRow = res.body.rows.find(
      (r) => r.type === "In Cart" && r.product === "Detail Export Product",
    );
    expect(cartRow.name).toBe("Guest (not logged in)");
  });
});

describe("GET /api/admin/abandoned-carts", () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);
  const ABANDON_CUTOFF_HOURS = 3; // must match adminController.js

  it("requires an admin token", async () => {
    const res = await request(app).get("/api/admin/abandoned-carts");
    expect(res.status).toBe(401);
  });

  it("only lists carts past the 3-hour cutoff, with items/value/reminder status, guests included", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({ name: "Abandoned Item", price: 500 });
    const cartItem = {
      product: product._id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity: 2,
    };

    const staleUser = await createUser({ name: "Neha Joshi" });
    const staleCart = await CartSnapshot.create({
      user: staleUser._id,
      items: [cartItem],
    });
    await CartSnapshot.collection.updateOne(
      { _id: staleCart._id },
      { $set: { updatedAt: hoursAgo(ABANDON_CUTOFF_HOURS + 1) } },
    );

    // A guest cart, also stale — must show as a placeholder, not dropped.
    const guestCart = await CartSnapshot.create({
      visitorId: "guest-abandoned-test",
      items: [cartItem],
    });
    await CartSnapshot.collection.updateOne(
      { _id: guestCart._id },
      { $set: { updatedAt: hoursAgo(ABANDON_CUTOFF_HOURS + 1) } },
    );

    // Too recent — must not appear.
    const freshUser = await createUser();
    await CartSnapshot.create({ user: freshUser._id, items: [cartItem] });

    const res = await request(app)
      .get("/api/admin/abandoned-carts")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.carts).toHaveLength(2);

    const userRow = res.body.carts.find((c) => c.name === "Neha Joshi");
    expect(userRow.value).toBe(1000); // 500 x 2
    expect(userRow.items).toEqual([
      { name: "Abandoned Item", quantity: 2, price: 500 },
    ]);
    expect(userRow.reminderSent).toBe(false);

    const guestRow = res.body.carts.find(
      (c) => c.name === "Guest (not logged in)",
    );
    expect(guestRow.value).toBe(1000);
  });

  it("reflects reminderSent once a reminder has actually gone out", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct();
    const user = await createUser();

    const cart = await CartSnapshot.create({
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
      reminderSentAt: new Date(),
    });
    await CartSnapshot.collection.updateOne(
      { _id: cart._id },
      { $set: { updatedAt: hoursAgo(ABANDON_CUTOFF_HOURS + 1) } },
    );

    const res = await request(app)
      .get("/api/admin/abandoned-carts")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.body.carts[0].reminderSent).toBe(true);
  });
});
