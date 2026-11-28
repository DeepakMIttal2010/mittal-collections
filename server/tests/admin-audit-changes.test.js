import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// PR-9b1: the admin audit log records the actual changes of an update --
// old -> new for allow-listed fields, "changed" + length for long text,
// counts for images/videos, per-size changes for variants -- and only
// for fields that really changed (the product form re-sends every field
// on each save). Owner decisions D1-D8 (2026-11-27):
//   D1 products (incl. trending), categories, subcategories, coupons
//   D2 cost fields keep values (audit log is Full Admin only)
//   D3 long text: changed + length, never the text
//   D4 images/videos: counts + main image changed, never URLs
//   D5 variants: price/oldPrice/stock per size, at most 50 sizes
//   D6 200 chars per value, 60 changes per entry, then truncated
//   D7 updates only
//   D8 PR-9a entries stay as they are
// Plus: allowlist is mandatory (a field not listed never gets a value) and
// a password/token/secret/otp/key denylist is applied on top of it.
//
// Entries are read straight from the collection, as in admin-audit-log.test.js.

vi.mock("../config/mailer.js", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../middleware/imageOptimizer.js", () => ({
  default: (req, _res, next) => {
    if (req.file) req.file.path = "https://example.com/uploaded-proof-url.jpg";
    next();
  },
}));

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Subcategory from "../models/Subcategory.js";
import Coupon from "../models/Coupon.js";
import Role from "../models/Role.js";
import { createUser, signToken, createProduct, createCategory } from "./helpers.js";

const auditCollection = () => mongoose.connection.collection("adminauditlogs");
const allEntries = () => auditCollection().find({}).sort({ createdAt: 1 }).toArray();
const loadDiff = async () => (await import("../utils/auditChanges.js")).diffForAudit;

const waitForEntries = async (count, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  let entries = await allEntries();
  while (entries.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    entries = await allEntries();
  }
  return entries;
};

const changeOf = (entry, field) => (entry.changes || []).find((c) => c.field === field);

// Every field the admin product form (EditProduct.jsx) sends, taken from
// the loaded copy unless overridden.
const STRING_FIELDS = [
  "nameHi", "fabric", "fabricHi", "color", "pattern", "size", "gsm", "gsmHi", "washCare", "washCareHi",
  "brand", "brandHi", "countryOfOrigin", "countryOfOriginHi", "whatsIncluded", "colorVariesNote",
  "colorVariesNoteHi", "adminRemarks",
];
const BOOLEAN_FIELDS = [
  "mrpVerified", "featured", "isActive", "isTrending", "showInNewArrivals", "isGiftingItem", "willRestock",
  "localDeliveryOnly", "isReturnable", "restockAlertEnabled",
];
const NUMBER_FIELDS = ["oldPrice", "trendingRank", "returnPeriodDays", "restockAlertQuantity", "purchasePrice", "miscExpenses"];

const productForm = (token, loaded, overrides = {}) => {
  const value = (key) => (key in overrides ? overrides[key] : loaded[key]);
  const images = value("images")?.length ? value("images") : [loaded.image];
  const req = request(app)
    .put(`/api/products/${loaded._id}`)
    .set("Authorization", `Bearer ${token}`)
    .field("name", value("name"))
    .field("description", value("description"))
    .field("descriptionHi", value("descriptionHi") ?? "")
    .field("price", String(value("price")))
    .field("category", String(value("category")))
    .field("subcategories", JSON.stringify((value("subcategories") || []).map(String)))
    .field("additionalCategories", JSON.stringify((value("additionalCategories") || []).map(String)))
    .field("stock", String(value("stock")))
    .field("stockBaseline", String(loaded.stock))
    .field("visibility", value("visibility") || "both")
    .field("existingImages", JSON.stringify(images))
    .field("existingVideos", JSON.stringify(value("videos") || []))
    .field("version", String(overrides.version ?? loaded.__v));
  for (const key of STRING_FIELDS) req.field(key, value(key) ?? "");
  for (const key of BOOLEAN_FIELDS) req.field(key, String(Boolean(value(key))));
  for (const key of NUMBER_FIELDS) req.field(key, String(value(key) ?? 0));
  const variants =
    overrides.variants ??
    (loaded.variants || []).map((v) => ({
      size: v.size,
      price: v.price,
      oldPrice: v.oldPrice,
      stock: v.stock,
      purchasePrice: v.purchasePrice,
      stockBaseline: v.stock,
    }));
  if (variants.length) req.field("variants", JSON.stringify(variants));
  if (overrides.mainImageIndex !== undefined) req.field("mainImageIndex", String(overrides.mainImageIndex));
  return req;
};

let fullAdmin;
let token;
beforeEach(async () => {
  fullAdmin = await createUser({ role: "admin", name: "Owner Admin" });
  token = signToken(fullAdmin);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// One full-form save first, so the stored product matches exactly what the
// form sends (defaults filled in); its audit entry is then cleared.
const normalized = async (product) => {
  const res = await productForm(token, await Product.findById(product._id));
  expect(res.status).toBe(200);
  await waitForEntries(1);
  await auditCollection().deleteMany({});
  return Product.findById(product._id);
};

const sizedProduct = () =>
  createProduct({
    price: 500,
    stock: 9,
    variants: [
      { size: "Single", price: 500, oldPrice: 0, stock: 5, purchasePrice: 0 },
      { size: "King", price: 700, oldPrice: 0, stock: 4, purchasePrice: 0 },
    ],
  });

describe("PR-9b1: product updates record what actually changed", () => {
  it("1. price 999 -> 899 is the only change recorded, with old and new value", async () => {
    const loaded = await normalized(await createProduct({ price: 999 }));
    const res = await productForm(token, loaded, { price: 899 });
    expect(res.status).toBe(200);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe("success");
    expect(entries[0].changes).toEqual([{ field: "price", from: 999, to: 899 }]);
    // PR-9a's field-name list is still there (D8).
    expect(entries[0].fields).toContain("price");
  });

  it("2. (guard) re-saving the full form without edits records no changes", async () => {
    const loaded = await normalized(await createProduct({ price: 999 }));
    const res = await productForm(token, loaded);
    expect(res.status).toBe(200);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].changes ?? []).toEqual([]);
    expect(entries[0].fields.length).toBeGreaterThan(20);
  });

  it("3. one size's stock change records that size and the new total, nothing else (D5)", async () => {
    const loaded = await normalized(await sizedProduct());
    const variants = loaded.variants.map((v) => ({
      size: v.size,
      price: v.price,
      oldPrice: v.oldPrice,
      stock: v.size === "King" ? 6 : v.stock,
      purchasePrice: v.purchasePrice,
      stockBaseline: v.stock,
    }));
    const res = await productForm(token, loaded, { variants });
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(entry.changes).toHaveLength(2);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: "variants[King].stock", from: 4, to: 6 },
        { field: "stock", from: 9, to: 11 },
      ]),
    );
  });

  it("4. an added and a removed size are recorded as such (D5)", async () => {
    const loaded = await normalized(await sizedProduct());
    const variants = [
      { size: "King", price: 700, oldPrice: 0, stock: 4, purchasePrice: 0, stockBaseline: 4 },
      { size: "Queen", price: 650, oldPrice: 0, stock: 3, purchasePrice: 0 },
    ];
    const res = await productForm(token, loaded, { variants });
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: "variants[Queen]", added: true },
        { field: "variants[Single]", removed: true },
      ]),
    );
  });

  it("5. a description change records 'changed' and the lengths, never the text (D3)", async () => {
    const loaded = await normalized(await createProduct());
    const newText = "Freshly rewritten description NEWTEXT-MARKER-88 with soft cotton details.";
    const res = await productForm(token, loaded, { description: newText });
    expect(res.status).toBe(200);
    const after = await Product.findById(loaded._id);

    const [entry] = await waitForEntries(1);
    expect(changeOf(entry, "description")).toEqual({
      field: "description",
      changed: true,
      fromLength: loaded.description.length,
      toLength: after.description.length,
    });
    expect(JSON.stringify(entry)).not.toContain("NEWTEXT-MARKER-88");
    expect(JSON.stringify(entry)).not.toContain(loaded.description);
  });

  it("6. images record counts and whether the main image changed, never URLs (D4)", async () => {
    const loaded = await normalized(await createProduct({ image: "https://example.com/first-IMG-A.jpg" }));
    const images = ["https://example.com/first-IMG-A.jpg", "https://example.com/second-IMG-MARKER.jpg"];
    const res = await productForm(token, loaded, { images, mainImageIndex: 1 });
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(changeOf(entry, "images")).toEqual({ field: "images", fromCount: 1, toCount: 2, mainImageChanged: true });
    expect(changeOf(entry, "image")).toBeUndefined();
    const stored = JSON.stringify(entry);
    expect(stored).not.toContain("IMG-MARKER");
    expect(stored).not.toContain("IMG-A");
  });

  it("7. cost fields keep their values, visible to the Full Admin only (D2)", async () => {
    const loaded = await normalized(await createProduct({ purchasePrice: 0, miscExpenses: 0 }));
    const res = await productForm(token, loaded, { purchasePrice: 450, miscExpenses: 20 });
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(changeOf(entry, "purchasePrice")).toEqual({ field: "purchasePrice", from: 0, to: 450 });
    expect(changeOf(entry, "miscExpenses")).toEqual({ field: "miscExpenses", from: 0, to: 20 });

    const asOwner = await request(app).get("/api/admin/audit-log").set("Authorization", `Bearer ${token}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.entries[0].changes).toEqual(
      expect.arrayContaining([{ field: "purchasePrice", from: 0, to: 450 }]),
    );

    const role = await Role.create({
      name: "Everything Staff",
      permissions: ["dashboard", "orders", "products", "customers", "staff-users", "roles", "settings", "reports", "accounts"],
      writeAccess: [],
    });
    const staff = await createUser({ role: "admin", adminRole: role._id });
    const asStaff = await request(app).get("/api/admin/audit-log").set("Authorization", `Bearer ${signToken(staff)}`);
    expect(asStaff.status).toBe(403);
    expect(JSON.stringify(asStaff.body)).not.toContain("purchasePrice");
  });

  it("8. (guard) a refused update -- version conflict 409 or validation 400 -- records no changes", async () => {
    const loaded = await normalized(await createProduct({ price: 999 }));
    const conflict = await productForm(token, loaded, { price: 899, version: loaded.__v + 5 });
    expect(conflict.status).toBe(409);
    const invalid = await productForm(token, loaded, { price: 0 });
    expect(invalid.status).toBe(400);

    const entries = await waitForEntries(2);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.outcome).toBe("failed");
      expect(entry.changes ?? []).toEqual([]);
    }
    expect((await Product.findById(loaded._id)).price).toBe(999);
  });

  it("9. a restricted staff member's price change is recorded with their role and the change", async () => {
    const loaded = await normalized(await createProduct({ price: 999 }));
    const role = await Role.create({ name: "Catalog Staff", permissions: ["products"], writeAccess: ["products:modified"] });
    const staff = await createUser({ role: "admin", adminRole: role._id, name: "Catalog Person" });
    const res = await productForm(signToken(staff), loaded, { price: 949 });
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(entry.actor.roleName).toBe("Catalog Staff");
    expect(entry.changes).toEqual([{ field: "price", from: 999, to: 949 }]);
  });

  it("10. the trending toggle records isTrending and trendingRank old -> new", async () => {
    const product = await createProduct({ isTrending: false, trendingRank: 0 });
    const res = await request(app)
      .patch(`/api/products/${product._id}/trending`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isTrending: true, trendingRank: 3 });
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: "isTrending", from: false, to: true },
        { field: "trendingRank", from: 0, to: 3 },
      ]),
    );
    expect(entry.changes).toHaveLength(2);
  });
});

describe("PR-9b1: categories, subcategories and coupons", () => {
  it("11. category: name, isActive and displayOrder old -> new; description changed only", async () => {
    const category = await createCategory({ name: "Dohars", isActive: true, displayOrder: 0, description: "Old text" });
    const res = await request(app)
      .put(`/api/categories/${category._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Dohars & AC Quilts")
      .field("isActive", "false")
      .field("displayOrder", "5")
      .field("description", "New category text CATDESC-MARKER");
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: "name", from: "Dohars", to: "Dohars & AC Quilts" },
        { field: "isActive", from: true, to: false },
        { field: "displayOrder", from: 0, to: 5 },
        { field: "description", changed: true, fromLength: 8, toLength: 32 },
      ]),
    );
    expect(JSON.stringify(entry)).not.toContain("CATDESC-MARKER");
  });

  it("12. subcategory: name and displayOrder old -> new; subtitle changed only", async () => {
    const category = await createCategory();
    const sub = await Subcategory.create({
      category: category._id,
      groupLabel: "Size",
      name: "Double Bed",
      slug: "double-bed",
      displayOrder: 1,
      subtitle: "Old subtitle",
    });
    const res = await request(app)
      .put(`/api/subcategories/${sub._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Double Bed (90 x 100)")
      .field("displayOrder", "2")
      .field("subtitle", "New subtitle SUBTITLE-MARKER");
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: "name", from: "Double Bed", to: "Double Bed (90 x 100)" },
        { field: "displayOrder", from: 1, to: 2 },
        { field: "subtitle", changed: true, fromLength: 12, toLength: 28 },
      ]),
    );
    expect(JSON.stringify(entry)).not.toContain("SUBTITLE-MARKER");
  });

  it("13. coupon: discountValue and isActive old -> new; description changed only", async () => {
    const coupon = await Coupon.create({
      code: "AUDIT10",
      discountType: "percentage",
      discountValue: 10,
      isActive: true,
      description: "Ten off",
    });
    const res = await request(app)
      .put(`/api/coupons/${coupon._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ discountValue: 15, isActive: false, description: "Fifteen off COUPON-MARKER" });
    expect(res.status).toBe(200);

    const [entry] = await waitForEntries(1);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: "discountValue", from: 10, to: 15 },
        { field: "isActive", from: true, to: false },
        { field: "description", changed: true, fromLength: 7, toLength: 25 },
      ]),
    );
    expect(entry.changes).toHaveLength(3);
    expect(JSON.stringify(entry)).not.toContain("COUPON-MARKER");
  });
});

describe("PR-9b1: the diff helper's safety rules", () => {
  it("14. denylisted names (password/token/secret/otp/key) never get values, even when allow-listed", async () => {
    const diffForAudit = await loadDiff();
    const spec = { values: ["price", "password", "apiKey", "clientSecret", "otp", "authToken"], changeOnly: [] };
    const before = { price: 1, password: "OLD-PASS-X1", apiKey: "OLD-KEY-X2", clientSecret: "OLD-SEC-X3", otp: "111111", authToken: "OLD-TOK-X4" };
    const after = { price: 2, password: "NEW-PASS-Y1", apiKey: "NEW-KEY-Y2", clientSecret: "NEW-SEC-Y3", otp: "222222", authToken: "NEW-TOK-Y4" };

    const { changes } = diffForAudit(before, after, spec);
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "price", from: 1, to: 2 },
        { field: "password", changed: true },
        { field: "apiKey", changed: true },
        { field: "clientSecret", changed: true },
        { field: "otp", changed: true },
        { field: "authToken", changed: true },
      ]),
    );
    const stored = JSON.stringify(changes);
    for (const secret of [...Object.values(before), ...Object.values(after)].filter((v) => typeof v === "string")) {
      expect(stored).not.toContain(secret);
    }
  });

  it("15. a field that isn't in the allowlist is never recorded", async () => {
    const diffForAudit = await loadDiff();
    const { changes } = diffForAudit(
      { price: 1, internalNote: "OLD-NOTE" },
      { price: 1, internalNote: "NEW-NOTE" },
      { values: ["price"], changeOnly: [] },
    );
    expect(changes).toEqual([]);
  });

  it("16. caps: values cut to 200 characters, at most 60 changes and 50 sizes, then truncated (D5/D6)", async () => {
    const diffForAudit = await loadDiff();

    const long = diffForAudit({ name: "a" }, { name: "b".repeat(500) }, { values: ["name"], changeOnly: [] });
    expect(long.changes[0].to).toHaveLength(200);
    expect(long.truncated).toBe(false);

    const keys = Array.from({ length: 70 }, (_, i) => `f${i}`);
    const many = diffForAudit(
      Object.fromEntries(keys.map((k) => [k, 0])),
      Object.fromEntries(keys.map((k) => [k, 1])),
      { values: keys, changeOnly: [] },
    );
    expect(many.changes).toHaveLength(60);
    expect(many.truncated).toBe(true);

    const sizes = Array.from({ length: 60 }, (_, i) => `S${i}`);
    const variantSpec = { values: [], changeOnly: [], variants: { key: "size", fields: ["stock"] } };
    const sized = diffForAudit(
      { variants: sizes.map((size) => ({ size, stock: 1 })) },
      { variants: sizes.map((size) => ({ size, stock: 2 })) },
      variantSpec,
    );
    expect(sized.changes).toHaveLength(50);
    expect(sized.truncated).toBe(true);
  });
});
