// /trending renders one ProductGrid per category section. ProductGrid
// defaults to 4 eager + fetchpriority=high cards, so every section used to
// get them (5 sections = 20 high-priority images, 16-18 below the fold,
// measured live 2026-11-16). Only the first section may be prioritised.
//   node --test scripts/trending-image-priority.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs
  .readFileSync(new URL("../src/pages/TrendingPage.jsx", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

test("TrendingPage passes priorityCount only to the first section's grid", () => {
  const grids = [...src.matchAll(/<ProductGrid\b([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(grids.length, 1, "expected exactly one ProductGrid in TrendingPage");
  assert.match(grids[0], /priorityCount=\{\s*sectionIndex === 0 \? 4 : 0\s*\}/);
  assert.match(src, /sections\.map\(\(\{ category, products \}, sectionIndex\) =>/);
});

test("ProductGrid still honours priorityCount", () => {
  const grid = fs
    .readFileSync(new URL("../src/components/ProductGrid/ProductGrid.jsx", import.meta.url), "utf8")
    .replace(/\r\n/g, "\n");
  assert.match(grid, /priority=\{index < priorityCount\}/);
});
