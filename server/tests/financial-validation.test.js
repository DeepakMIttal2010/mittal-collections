import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import SiteSettings from "../models/SiteSettings.js";
import { invalidateBundleRulesCache } from "../utils/bundleDiscount.js";
import {
  createUser,
  signToken,
  createProduct,
  createCategory,
  seedSiteSettings,
} from "./helpers.js";

// PR-1 (admin audit PI-01 + ST-01): a price of ₹0 or a bundle discount
// outside 0-100% must never be saved, and must never turn into a free or
// overcharged order even if such a value somehow already sits in the DB.

const adminToken = async () => signToken(await createUser({ role: "admin" }));

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

// Same multipart shape EditProduct.jsx sends.
const saveForm = (token, loaded, { price, variants } = {}) => {
  const req = request(app)
    .put(`/api/products/${loaded._id}`)
    .set("Authorization", `Bearer ${token}`)
    .field("name", loaded.name)
    .field("description", loaded.description)
    .field("price", price ?? String(loaded.price))
    .field("category", loaded.category.toString())
    .field("stock", String(loaded.stock))
    .field("existingImages", JSON.stringify([loaded.image]))
    .field("version", String(loaded.__v));
  if (variants) req.field("variants", JSON.stringify(variants));
  return req;
};

const placeOrder = (customer, product, quantity = 1) =>
  request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${signToken(customer)}`)
    .send({
      orderItems: [
        {
          product: product._id.toString(),
          name: product.name,
          image: product.image,
          price: product.price,
          quantity,
        },
      ],
      shippingAddress,
      paymentMethod: "COD",
    });

describe("PR-1: product prices must be above ₹0", () => {
  it.each(["0", "", "-5", "abc"])("rejects an edit with top-level price %j and keeps the old price", async (price) => {
    const token = await adminToken();
    const product = await createProduct({ price: 553 });

    const res = await saveForm(token, product, { price });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/price/i);
    expect((await Product.findById(product._id)).price).toBe(553);
  });

  it("accepts an edit with a positive price", async () => {
    const token = await adminToken();
    const product = await createProduct({ price: 553 });

    const res = await saveForm(token, product, { price: "1" });

    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).price).toBe(1);
  });

  it.each(["0", "", "-1", "abc"])("rejects a size row priced %j, names the size, and changes nothing", async (badPrice) => {
    const token = await adminToken();
    const product = await createProduct({
      price: 400,
      stock: 5,
      variants: [
        { size: "Single", price: 400, stock: 2 },
        { size: "Double", price: 600, stock: 3 },
      ],
    });

    const res = await saveForm(token, product, {
      variants: [
        { size: "Single", price: 400, stock: 2 },
        { size: "Double", price: badPrice, stock: 3 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Double/);
    const after = await Product.findById(product._id);
    expect(after.variants.map((v) => [v.size, v.price])).toEqual([
      ["Single", 400],
      ["Double", 600],
    ]);
  });

  it("still ignores a completely blank size row (no size, no price)", async () => {
    const token = await adminToken();
    const product = await createProduct({
      price: 400,
      stock: 2,
      variants: [{ size: "Single", price: 400, stock: 2 }],
    });

    const res = await saveForm(token, product, {
      variants: [
        { size: "Single", price: 450, stock: 2 },
        { size: "", price: "", stock: 0 },
      ],
    });

    expect(res.status).toBe(200);
    const after = await Product.findById(product._id);
    expect(after.variants).toHaveLength(1);
    expect(after.price).toBe(450);
  });

  it("rejects a new product priced ₹0 before anything else is checked", async () => {
    const token = await adminToken();
    const category = await createCategory();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Free Bedsheet")
      .field("description", "Should never be saved")
      .field("price", "0")
      .field("category", category._id.toString())
      .field("stock", "5");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/price/i);
    expect(await Product.countDocuments({ name: "Free Bedsheet" })).toBe(0);
  });

  it("rejects a new product whose size row is priced ₹0", async () => {
    const token = await adminToken();
    const category = await createCategory();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Sized Bedsheet")
      .field("description", "Should never be saved")
      .field("price", "500")
      .field("category", category._id.toString())
      .field("stock", "5")
      .field("variants", JSON.stringify([{ size: "King", price: 0, stock: 5 }]));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/King/);
  });
});

describe("PR-1: checkout never sells an item priced ₹0", () => {
  it("refuses the order and leaves stock untouched when the DB price is 0", async () => {
    await seedSiteSettings();
    const customer = await createUser();
    const product = await createProduct({ price: 0, stock: 4 });

    const res = await placeOrder(customer, product);

    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(product._id)).stock).toBe(4);
  });

  it("refuses a size whose DB price is 0", async () => {
    await seedSiteSettings();
    const customer = await createUser();
    const product = await createProduct({
      price: 300,
      stock: 3,
      variants: [{ size: "Single", price: 0, stock: 3 }],
    });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${signToken(customer)}`)
      .send({
        orderItems: [
          { product: product._id.toString(), name: product.name, image: product.image, price: 0, quantity: 1, size: "Single" },
        ],
        shippingAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(product._id)).variants[0].stock).toBe(3);
  });
});

describe("PR-1: bundle discount must be more than 0% and at most 100%", () => {
  // calculateBundleDiscount caches the rules for 60s in memory.
  beforeEach(() => invalidateBundleRulesCache());

  const rulesWith = async (discountPercent) => {
    const [a, b] = [await createCategory({ name: "Bedsheets" }), await createCategory({ name: "Curtains" })];
    return [{ categoryA: a._id.toString(), categoryB: b._id.toString(), discountPercent, isActive: true }];
  };

  it.each([0, 150, -10, "abc"])("rejects saving a bundle rule of %s percent", async (pct) => {
    const token = await adminToken();
    await seedSiteSettings();

    const res = await request(app)
      .put("/api/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ bundleRules: await rulesWith(pct) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bundle/i);
    expect((await SiteSettings.findOne()).bundleRules).toHaveLength(0);
  });

  it.each([5, 100])("accepts a bundle rule of %s percent", async (pct) => {
    const token = await adminToken();
    await seedSiteSettings();

    const res = await request(app)
      .put("/api/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ bundleRules: await rulesWith(pct) });

    expect(res.status).toBe(200);
    expect((await SiteSettings.findOne()).bundleRules[0].discountPercent).toBe(pct);
  });

  it.each([150, -10])("an out-of-range rule already in the DB (%s percent) gives no discount at checkout", async (pct) => {
    const [a, b] = [await createCategory({ name: "Bedsheets" }), await createCategory({ name: "Curtains" })];
    await seedSiteSettings({
      bundleRules: [{ categoryA: a._id, categoryB: b._id, discountPercent: pct, isActive: true }],
    });
    const customer = await createUser();
    const sheet = await createProduct({ name: "Sheet", price: 600, stock: 5, category: a._id });
    const curtain = await createProduct({ name: "Curtain", price: 400, stock: 5, category: b._id });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${signToken(customer)}`)
      .send({
        orderItems: [sheet, curtain].map((p) => ({
          product: p._id.toString(),
          name: p.name,
          image: p.image,
          price: p.price,
          quantity: 1,
        })),
        shippingAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(201);
    expect(res.body.order.bundleDiscountAmount).toBe(0);
    expect(res.body.order.totalPrice).toBeGreaterThanOrEqual(1000);
  });

  it("skipping a corrupt rule leaves a valid rule on the same cart working exactly as before", async () => {
    const [a, b, c] = [
      await createCategory({ name: "Bedsheets" }),
      await createCategory({ name: "Curtains" }),
      await createCategory({ name: "Cushions" }),
    ];
    await seedSiteSettings({
      bundleRules: [
        // Would win (biggest rupee discount) if it were trusted.
        { categoryA: a._id, categoryB: b._id, discountPercent: 150, isActive: true },
        { categoryA: a._id, categoryB: c._id, discountPercent: 5, isActive: true },
      ],
    });
    const customer = await createUser();
    const sheet = await createProduct({ name: "Sheet", price: 600, stock: 5, category: a._id });
    const curtain = await createProduct({ name: "Curtain", price: 400, stock: 5, category: b._id });
    const cushion = await createProduct({ name: "Cushion", price: 200, stock: 5, category: c._id });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${signToken(customer)}`)
      .send({
        orderItems: [sheet, curtain, cushion].map((p) => ({
          product: p._id.toString(),
          name: p.name,
          image: p.image,
          price: p.price,
          quantity: 1,
        })),
        shippingAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(201);
    // 5% of the Sheet + Cushion pair (600 + 200) only.
    expect(res.body.order.bundleDiscountAmount).toBe(40);
  });

  it("a valid 5% rule still discounts the bundle (unchanged behaviour)", async () => {
    const [a, b] = [await createCategory({ name: "Bedsheets" }), await createCategory({ name: "Curtains" })];
    await seedSiteSettings({
      bundleRules: [{ categoryA: a._id, categoryB: b._id, discountPercent: 5, isActive: true }],
    });
    const customer = await createUser();
    const sheet = await createProduct({ name: "Sheet", price: 600, stock: 5, category: a._id });
    const curtain = await createProduct({ name: "Curtain", price: 400, stock: 5, category: b._id });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${signToken(customer)}`)
      .send({
        orderItems: [sheet, curtain].map((p) => ({
          product: p._id.toString(),
          name: p.name,
          image: p.image,
          price: p.price,
          quantity: 1,
        })),
        shippingAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(201);
    expect(res.body.order.bundleDiscountAmount).toBe(50);
  });
});
