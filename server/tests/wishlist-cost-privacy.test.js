import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import { createUser, signToken, createProduct } from "./helpers.js";

// Round 29: the wishlist populated the whole product, so the guest
// endpoint (no login) handed out purchase price, misc cost, sizes'
// purchase prices and admin remarks for any product.
const SECRET = /purchasePrice|miscExpenses|purchaseDate|adminRemarks/;

const costlyProduct = () =>
  createProduct({
    purchasePrice: 152,
    miscExpenses: 15,
    purchaseDate: new Date("2026-10-01"),
    adminRemarks: "supplier: GTM, bought at 152",
    variants: [
      { size: "7x4", price: 404, oldPrice: 475, stock: 5, purchasePrice: 190 },
      { size: "9x4", price: 468, oldPrice: 550, stock: 5, purchasePrice: 220 },
    ],
  });

describe("wishlist never exposes cost data", () => {
  it("guest wishlist (no login) returns the product without cost fields", async () => {
    const product = await costlyProduct();
    const visitorId = "guest-cost-check-1";

    await request(app).post("/api/wishlist/guest").send({ visitorId, productId: product._id.toString() }).expect(201);
    const res = await request(app).get(`/api/wishlist/guest/${visitorId}`);

    expect(res.status).toBe(200);
    const item = res.body.wishlist[0].product;
    expect(item.name).toBe("Test Product");
    expect(item.price).toBe(999);
    expect(item.variants.map((v) => v.price)).toEqual([404, 468]);
    expect(JSON.stringify(res.body)).not.toMatch(SECRET);
  });

  it("a logged-in customer's wishlist returns the product without cost fields", async () => {
    const product = await costlyProduct();
    const customer = await createUser();
    const auth = { Authorization: `Bearer ${signToken(customer)}` };

    await request(app).post("/api/wishlist").set(auth).send({ productId: product._id.toString() });
    const res = await request(app).get("/api/wishlist").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.wishlist).toHaveLength(1);
    expect(res.body.wishlist[0].product.price).toBe(999);
    expect(JSON.stringify(res.body)).not.toMatch(SECRET);
  });
});
