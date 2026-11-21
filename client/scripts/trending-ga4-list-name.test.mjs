// GA4 select_item list names for trending surfaces (T3):
//   /trending grid cards  -> item_list_name "trending"
//   homepage Top Trending -> item_list_name "home_trending"
//   every other ProductGrid/ProductCard keeps the default "product_list".
// Source checks (same style as the other scripts/*.test.mjs files) plus a
// run of the real trackSelectItem with a stubbed window.gtag.
//   node --test scripts/trending-ga4-list-name.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("ProductCard passes its listName prop to trackSelectItem", () => {
  const src = read("components/ProductCard/ProductCard.jsx");
  // listId (optional homepage section, 2026-11-21) is passed after listName.
  assert.match(src, /function ProductCard\(\{ product, priority = false, listName, listId \}\)/);
  assert.match(src, /onClick=\{\(\) => trackSelectItem\(product, listName, listId\)\}/);
  assert.equal((src.match(/trackSelectItem\(/g) || []).length, 1, "exactly one select_item call per card");
});

test("ProductGrid forwards listName to every card", () => {
  const src = read("components/ProductGrid/ProductGrid.jsx");
  assert.match(src, /function ProductGrid\(\{ products = \[\], priorityCount = 4, listName, listId \}\)/);
  assert.match(src, /listName=\{listName\}/);
  assert.match(src, /listId=\{listId\}/);
});

test("TrendingPage grid uses list name \"trending\"", () => {
  const src = read("pages/TrendingPage.jsx");
  const grids = [...src.matchAll(/<ProductGrid\b([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(grids.length, 1);
  assert.match(grids[0], /listName="trending"/);
});

test("homepage Top Trending cards fire select_item once with \"home_trending\"", () => {
  const src = read("components/TrendingSection/TrendingSection.jsx");
  assert.match(src, /import \{ trackSelectItem \} from "\.\.\/\.\.\/utils\/analytics";/);
  const calls = src.match(/trackSelectItem\([^)]*\)/g) || [];
  assert.deepEqual(calls, ['trackSelectItem(product, "home_trending")']);
});

test("no other page or component sets a list name", () => {
  for (const p of ["pages/CategoryPage.jsx", "pages/NewArrivalsPage.jsx", "pages/ClearanceSalePage.jsx", "pages/GiftingPage.jsx", "pages/SearchResults.jsx", "components/NewArrivals/CategoryNewArrivals.jsx"]) {
    assert.doesNotMatch(read(p), /listName=/, p);
  }
});

test("trackSelectItem: default stays product_list, explicit names pass through", async () => {
  const calls = [];
  globalThis.window = { gtag: (...args) => calls.push(args) };
  const { trackSelectItem } = await import("../src/utils/analytics.js");
  const product = { _id: "p1", name: "Sheet", price: 499, category: { name: "Bedsheets" } };
  trackSelectItem(product);
  trackSelectItem(product, undefined);
  trackSelectItem(product, "trending");
  trackSelectItem(product, "home_trending");
  assert.deepEqual(
    calls.map(([kind, name, params]) => [kind, name, params.item_list_name, params.items.length, params.items[0].item_id]),
    [
      ["event", "select_item", "product_list", 1, "p1"],
      ["event", "select_item", "product_list", 1, "p1"],
      ["event", "select_item", "trending", 1, "p1"],
      ["event", "select_item", "home_trending", 1, "p1"],
    ],
  );
  delete globalThis.window;
});
