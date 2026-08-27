import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import { createUser, signToken, createProduct } from "./helpers.js";

// PUT /api/products/:id is multipart/form-data (image upload middleware
// sits in front of it) — send it as form fields with no actual files,
// which the controller and imageOptimizer both handle as a no-op.
const updateProductRequest = (adminToken, product, overrides = {}) => {
  const req = request(app)
    .put(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .field("name", overrides.name ?? product.name)
    .field("description", overrides.description ?? product.description)
    .field("price", String(overrides.price ?? product.price))
    .field("category", product.category.toString())
    .field("stock", String(overrides.stock ?? product.stock))
    .field("existingImages", JSON.stringify([product.image]));

  if (overrides.version !== undefined) {
    req.field("version", String(overrides.version));
  }

  return req;
};

describe("Admin product update — concurrent-edit protection", () => {
  it("rejects a save based on a version that's no longer current, instead of silently overwriting a newer edit", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 500, stock: 9 });
    const originalVersion = product.__v;

    // Admin A saves a stock change first.
    const adminA = await updateProductRequest(adminToken, product, {
      stock: 20,
      version: originalVersion,
    });
    expect(adminA.status).toBe(200);

    // Admin B was editing from the same original copy (stale stock: 9)
    // and only meant to change the price — this must not go through and
    // silently revert Admin A's stock change back to 9.
    const adminB = await updateProductRequest(adminToken, product, {
      price: 700,
      stock: 9,
      version: originalVersion,
    });

    expect(adminB.status).toBe(409);
    expect(adminB.body.success).toBe(false);

    const reloaded = await Product.findById(product._id);
    expect(reloaded.stock).toBe(20); // Admin A's change survives
    expect(reloaded.price).toBe(500); // Admin B's rejected change never applied
  });

  it("allows the save once the client has the current version", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 500, stock: 9 });

    const first = await updateProductRequest(adminToken, product, {
      stock: 20,
      version: product.__v,
    });
    expect(first.status).toBe(200);

    const reloadedAfterFirst = await Product.findById(product._id);

    const second = await updateProductRequest(adminToken, reloadedAfterFirst, {
      price: 700,
      stock: 20,
      version: reloadedAfterFirst.__v,
    });

    expect(second.status).toBe(200);

    const final = await Product.findById(product._id);
    expect(final.stock).toBe(20);
    expect(final.price).toBe(700);
  });

  it("still allows a save when no version is sent (backward compatible)", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 500, stock: 9 });

    const res = await updateProductRequest(adminToken, product, { stock: 15 });

    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(15);
  });
});
