import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Role from "../models/Role.js";
import { createUser, signToken, createProduct } from "./helpers.js";

// PATCH /api/products/:id/trending sets isTrending/trendingRank only. The
// full-form PUT rebuilds variants, which gives every size row a new _id;
// this route must leave variants (and everything else) byte-identical.

const variantProduct = () =>
  createProduct({
    name: "Teal Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    purchasePrice: 190,
    miscExpenses: 15,
    images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    image: "https://example.com/b.jpg",
    description: "<p>Satin curtain</p>",
    variants: [
      { size: "7x4", price: 404, oldPrice: 475, stock: 10, purchasePrice: 190 },
      { size: "9x4", price: 468, oldPrice: 550, stock: 10, purchasePrice: 220 },
    ],
    price: 404,
    oldPrice: 475,
    stock: 20,
  });

const adminAuth = async (overrides = {}) => ({
  Authorization: `Bearer ${signToken(await createUser({ role: "admin", ...overrides }))}`,
});

let roleCounter = 0;
const staffAuth = async (permissions, writeAccess = []) => {
  roleCounter += 1;
  const role = await Role.create({ name: `Trending role ${roleCounter}`, permissions, writeAccess });
  return adminAuth({ adminRole: role._id });
};

const patch = (id, body, auth) =>
  request(app).patch(`/api/products/${id}/trending`).set(auth || {}).send(body);

describe("PATCH /api/products/:id/trending", () => {
  it("changes only isTrending, trendingRank and updatedAt", async () => {
    const product = await variantProduct();
    const before = (await Product.findById(product._id).lean());

    const res = await patch(product._id, { isTrending: true, trendingRank: 3 }, await adminAuth());

    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ isTrending: true, trendingRank: 3 });
    expect(JSON.stringify(res.body)).not.toMatch(/purchasePrice|miscExpenses/);

    const after = await Product.findById(product._id).lean();
    const changed = Object.keys({ ...before, ...after }).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    );
    expect(changed.sort()).toEqual(["isTrending", "trendingRank", "updatedAt"]);
    // Size rows keep their _ids (the full-form PUT regenerates them).
    expect(after.variants.map((v) => String(v._id))).toEqual(before.variants.map((v) => String(v._id)));
    expect(after.updatedAt > before.updatedAt).toBe(true);
  });

  it("can untick trending and reset the rank", async () => {
    const product = await createProduct({ isTrending: true, trendingRank: 5 });
    const res = await patch(product._id, { isTrending: false, trendingRank: 0 }, await adminAuth());

    expect(res.status).toBe(200);
    const after = await Product.findById(product._id).lean();
    expect(after).toMatchObject({ isTrending: false, trendingRank: 0 });
  });

  it("rejects bad input without writing", async () => {
    const product = await createProduct({ isTrending: false, trendingRank: 0 });
    const auth = await adminAuth();

    for (const body of [
      {},
      { isTrending: "true", trendingRank: 1 },
      { isTrending: true },
      { isTrending: true, trendingRank: -1 },
      { isTrending: true, trendingRank: 1.5 },
      { isTrending: true, trendingRank: "abc" },
    ]) {
      const res = await patch(product._id, body, auth);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await Product.findById(product._id).lean()).toMatchObject({ isTrending: false, trendingRank: 0 });
  });

  it("ignores any other field sent in the body", async () => {
    const product = await variantProduct();
    const res = await patch(
      product._id,
      { isTrending: true, trendingRank: 1, price: 1, stock: 0, variants: [], name: "Hacked" },
      await adminAuth(),
    );

    expect(res.status).toBe(200);
    const after = await Product.findById(product._id).lean();
    expect(after).toMatchObject({ name: "Teal Satin Eyelet Curtain - 7x4 & 9x4 Ft", price: 404, stock: 20 });
    expect(after.variants).toHaveLength(2);
  });

  it("404 for a missing product, 400 for a malformed id", async () => {
    const auth = await adminAuth();
    expect((await patch("6a0000000000000000000000", { isTrending: true, trendingRank: 1 }, auth)).status).toBe(404);
    expect((await patch("not-an-id", { isTrending: true, trendingRank: 1 }, auth)).status).toBe(400);
  });

  it("needs a logged-in admin with products edit access", async () => {
    const product = await createProduct();
    const body = { isTrending: true, trendingRank: 1 };

    expect((await patch(product._id, body)).status).toBe(401);

    const customer = { Authorization: `Bearer ${signToken(await createUser())}` };
    expect((await patch(product._id, body, customer)).status).toBe(403);

    // Staff who can see Products but has no "modified" write access.
    expect((await patch(product._id, body, await staffAuth(["products"]))).status).toBe(403);
    // Staff without the Products section at all.
    expect((await patch(product._id, body, await staffAuth(["orders"], ["products:modified"]))).status).toBe(403);
    // Staff with Products + modify rights is allowed.
    expect((await patch(product._id, body, await staffAuth(["products"], ["products:modified"]))).status).toBe(200);

    expect(await Product.findById(product._id).lean()).toMatchObject({ isTrending: true, trendingRank: 1 });
  });
});
