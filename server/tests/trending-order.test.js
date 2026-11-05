import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import TrendingSection from "../models/TrendingSection.js";
import { createCategory, createProduct } from "./helpers.js";

// Explicit ranks (> 0) come first, 1 -> n; unranked (0) products follow,
// most recently edited first. A plain sort on trendingRank used to put
// every 0 ahead of rank 1.
const seed = async () => {
  const category = await createCategory();
  const make = (name, trendingRank, updatedAt) =>
    createProduct({ name, category: category._id, isTrending: true, trendingRank }).then((p) =>
      Product.collection.updateOne({ _id: p._id }, { $set: { updatedAt: new Date(updatedAt) } }),
    );

  await make("Unranked old", 0, "2026-10-01");
  await make("Rank 2", 2, "2026-10-02");
  await make("Unranked new", 0, "2026-10-05");
  await make("Rank 1", 1, "2026-10-03");
  await createProduct({ name: "Not trending", category: category._id, trendingRank: 1 });
  await TrendingSection.create({ category: category._id, displayOrder: 1 });
  return category;
};

const names = (products) => products.map((p) => p.name);

describe("trending product order", () => {
  it("by-category: ranked products first, then unranked newest-edited first", async () => {
    await seed();
    const res = await request(app).get("/api/products/trending-by-category?limit=10").expect(200);

    expect(res.body.sections).toHaveLength(1);
    expect(names(res.body.sections[0].products)).toEqual([
      "Rank 1",
      "Rank 2",
      "Unranked new",
      "Unranked old",
    ]);
  });

  it("by-category: the limit keeps the ranked picks and drops unranked ones", async () => {
    await seed();
    const two = await request(app).get("/api/products/trending-by-category?limit=2").expect(200);
    expect(names(two.body.sections[0].products)).toEqual(["Rank 1", "Rank 2"]);

    const three = await request(app).get("/api/products/trending-by-category?limit=3").expect(200);
    expect(names(three.body.sections[0].products)).toEqual(["Rank 1", "Rank 2", "Unranked new"]);
  });

  it("flat /trending list uses the same order and never returns cost fields", async () => {
    await seed();
    const res = await request(app).get("/api/products/trending?limit=10").expect(200);

    expect(names(res.body.products)).toEqual(["Rank 1", "Rank 2", "Unranked new", "Unranked old"]);
    expect(JSON.stringify(res.body)).not.toMatch(/purchasePrice|miscExpenses|adminRemarks/);
  });

  it("with no ranked products the order is unchanged (newest-edited first)", async () => {
    const category = await createCategory();
    for (const [name, at] of [["A", "2026-10-01"], ["B", "2026-10-03"], ["C", "2026-10-02"]]) {
      const p = await createProduct({ name, category: category._id, isTrending: true });
      await Product.collection.updateOne({ _id: p._id }, { $set: { updatedAt: new Date(at) } });
    }
    await TrendingSection.create({ category: category._id });

    const res = await request(app).get("/api/products/trending-by-category").expect(200);
    expect(names(res.body.sections[0].products)).toEqual(["B", "C", "A"]);
  });
});
