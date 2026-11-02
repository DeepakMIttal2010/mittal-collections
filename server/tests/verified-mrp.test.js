import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// updateProduct runs in a transaction, so this file needs the replica set.
import "./setup-replset.js";
import app from "../app.js";
import Product from "../models/Product.js";
import { verifiedMrp } from "../utils/verifiedMrp.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const items = (xml) => xml.split("<item>").slice(1);
const tag = (item, name) => (item.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1];
const feedItemsFor = async (product) => {
  const res = await request(app).get("/api/feed/google.xml");
  expect(res.status).toBe(200);
  const id = String(product._id);
  return items(res.text).filter((i) => tag(i, "g:id") === id || tag(i, "g:item_group_id") === id);
};

describe("verifiedMrp", () => {
  it("returns oldPrice only for a verified product whose oldPrice is above the price", () => {
    expect(verifiedMrp({ mrpVerified: true, price: 400, oldPrice: 500 })).toBe(500);
    expect(verifiedMrp({ mrpVerified: false, price: 400, oldPrice: 500 })).toBe(0);
    expect(verifiedMrp({ price: 400, oldPrice: 500 })).toBe(0); // field missing
    expect(verifiedMrp({ mrpVerified: true, price: 500, oldPrice: 500 })).toBe(0);
    expect(verifiedMrp({ mrpVerified: true, price: 600, oldPrice: 500 })).toBe(0);
    expect(verifiedMrp({ mrpVerified: true, price: 400, oldPrice: 0 })).toBe(0);
    expect(verifiedMrp(null)).toBe(0);
  });

  it("uses the variant's own prices under the product-level flag", () => {
    const product = { mrpVerified: true, price: 404, oldPrice: 475 };
    expect(verifiedMrp(product, { price: 468, oldPrice: 550 })).toBe(550);
    expect(verifiedMrp({ ...product, mrpVerified: false }, { price: 468, oldPrice: 550 })).toBe(0);
  });
});

describe("Google feed: sale price only against a verified MRP", () => {
  it("unverified product: g:price is the selling price and there is no g:sale_price", async () => {
    const product = await createProduct({ price: 404, oldPrice: 800 });
    const [item] = await feedItemsFor(product);
    expect(tag(item, "g:price")).toBe("404.00 INR");
    expect(item).not.toContain("g:sale_price");
  });

  it("verified product: g:price is the MRP and g:sale_price the selling price", async () => {
    const product = await createProduct({ price: 404, oldPrice: 800, mrpVerified: true });
    const [item] = await feedItemsFor(product);
    expect(tag(item, "g:price")).toBe("800.00 INR");
    expect(tag(item, "g:sale_price")).toBe("404.00 INR");
  });

  it("verified product priced at or above its MRP: no sale price", async () => {
    const product = await createProduct({ price: 500, oldPrice: 500, mrpVerified: true });
    const [item] = await feedItemsFor(product);
    expect(tag(item, "g:price")).toBe("500.00 INR");
    expect(item).not.toContain("g:sale_price");
  });

  it("sized products follow the product-level flag for every size", async () => {
    const variants = [
      { size: "7x4 Ft", price: 404, oldPrice: 475, stock: 5 },
      { size: "9x4 Ft", price: 468, oldPrice: 550, stock: 5 },
    ];
    const unverified = await createProduct({ name: "Unverified Curtain", price: 404, oldPrice: 475, stock: 10, variants });
    const verified = await createProduct({ name: "Verified Curtain", price: 404, oldPrice: 475, stock: 10, variants, mrpVerified: true });

    const u = await feedItemsFor(unverified);
    expect(u.map((i) => tag(i, "g:price"))).toEqual(["404.00 INR", "468.00 INR"]);
    expect(u.some((i) => i.includes("g:sale_price"))).toBe(false);

    const v = await feedItemsFor(verified);
    expect(v.map((i) => tag(i, "g:price"))).toEqual(["475.00 INR", "550.00 INR"]);
    expect(v.map((i) => tag(i, "g:sale_price"))).toEqual(["404.00 INR", "468.00 INR"]);
  });
});

describe("big-savings (clearance): only verified MRP discounts count", () => {
  it("lists a verified 50%-off product but not an unverified one", async () => {
    const verified = await createProduct({ name: "Verified Deal", price: 400, oldPrice: 800, stock: 5, mrpVerified: true });
    const unverified = await createProduct({ name: "Reference Price Only", price: 400, oldPrice: 800, stock: 5 });

    const res = await request(app).get("/api/products/big-savings");
    expect(res.status).toBe(200);
    const ids = res.body.sections.flatMap((s) => s.products.map((p) => String(p._id)));
    expect(ids).toContain(String(verified._id));
    expect(ids).not.toContain(String(unverified._id));
  });

  it("returns no sections when no product is verified", async () => {
    await createProduct({ price: 400, oldPrice: 800, stock: 5 });
    const res = await request(app).get("/api/products/big-savings");
    expect(res.body.sections).toEqual([]);
  });
});

describe("product mrpVerified field", () => {
  it("defaults to false for existing products, and the public API returns it", async () => {
    const product = await createProduct({ price: 400, oldPrice: 800 });
    // Simulate a product saved before the field existed.
    await Product.collection.updateOne({ _id: product._id }, { $unset: { mrpVerified: "" } });

    const doc = await Product.findById(product._id);
    expect(doc.mrpVerified).toBe(false);
    expect(doc.oldPrice).toBe(800);

    const res = await request(app).get(`/api/products/${product._id}`);
    expect(res.body.product.mrpVerified).toBe(false);
  });

  const editForm = (token, loaded, extra = {}) => {
    const req = request(app)
      .put(`/api/products/${loaded._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("name", loaded.name)
      .field("description", loaded.description)
      .field("price", String(loaded.price))
      .field("oldPrice", String(loaded.oldPrice))
      .field("category", loaded.category.toString())
      .field("stock", String(loaded.stock))
      .field("existingImages", JSON.stringify([loaded.image]))
      .field("version", String(loaded.__v));
    for (const [k, v] of Object.entries(extra)) req.field(k, v);
    return req;
  };

  it("an admin can tick and untick it; prices and stock are untouched", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 400, oldPrice: 800, stock: 7 });

    const on = await editForm(token, await Product.findById(product._id), { mrpVerified: "true" });
    expect(on.status).toBe(200);
    let saved = await Product.findById(product._id);
    expect(saved.mrpVerified).toBe(true);
    expect([saved.price, saved.oldPrice, saved.stock]).toEqual([400, 800, 7]);

    const off = await editForm(token, saved, { mrpVerified: "false" });
    expect(off.status).toBe(200);
    saved = await Product.findById(product._id);
    expect(saved.mrpVerified).toBe(false);
    expect([saved.price, saved.oldPrice, saved.stock]).toEqual([400, 800, 7]);
  });

  it("an update that does not send the field keeps the existing value", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({ price: 400, oldPrice: 800, mrpVerified: true });

    const res = await editForm(signToken(admin), await Product.findById(product._id));
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).mrpVerified).toBe(true);
  });

  it("a duplicated product starts unverified", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({ price: 400, oldPrice: 800, mrpVerified: true });

    const res = await request(app)
      .post(`/api/products/${product._id}/duplicate`)
      .set("Authorization", `Bearer ${signToken(admin)}`);
    expect(res.status).toBeLessThan(300);
    const copy = await Product.findOne({ name: `${product.name} (Copy)` });
    expect(copy.mrpVerified).toBe(false);
    expect(copy.oldPrice).toBe(800);
  });
});
