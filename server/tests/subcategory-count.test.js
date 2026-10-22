import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Subcategory from "../models/Subcategory.js";
import { createCategory, createProduct } from "./helpers.js";

describe("GET /api/subcategories: productCount", () => {
  it("counts listable products per subcategory with the same filter as categories", async () => {
    const category = await createCategory();
    const sub = await Subcategory.create({ category: category._id, groupLabel: "By Type", name: "Anti-Slip", slug: "anti-slip" });

    await createProduct({ category: category._id, subcategories: [sub._id], stock: 3 });
    await createProduct({ category: category._id, subcategories: [sub._id], stock: 2 });
    await createProduct({ category: category._id, subcategories: [], stock: 4 }); // in the category, not the sub
    await createProduct({ category: category._id, subcategories: [sub._id], stock: 0, willRestock: false }); // hidden from listings
    await createProduct({ category: category._id, subcategories: [sub._id], stock: 5, isActive: false }); // deleted

    const subs = (await request(app).get("/api/subcategories")).body.subcategories;
    expect(subs.find((s) => s.slug === "anti-slip").productCount).toBe(2);

    const cats = (await request(app).get("/api/categories")).body.categories;
    expect(cats.find((c) => String(c._id) === String(category._id)).productCount).toBe(3);
  });
});
