// Homepage section tracking (2026-11-21): which homepage section a visitor
// clicked, and how far down the homepage they scrolled.
//   node --test scripts/home-section-tracking.test.mjs
//
// - Product clicks keep item_list_name "product_list" (existing reports
//   unchanged) and add item_list_id = the homepage section.
// - Category / size / price / "view all" links send select_content with
//   content_type "home_section".
// - home_scroll_25/50/75/90, each once per homepage view.
// - Payloads carry only approved keys: no email, customer id, order data
//   or tokens. Without gtag (localhost, /admin, unsubscribe pages) nothing
//   is sent and nothing throws.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const calls = [];
globalThis.window = { gtag: (...args) => calls.push(args) };

const { trackSelectItem, trackHomeSectionClick, trackHomeScroll, HOME_SECTIONS } = await import("../src/utils/analytics.js");
const { createScrollDepthTracker, SCROLL_DEPTHS } = await import("../src/utils/homeScrollDepth.js");

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const PRODUCT = { _id: "p1", name: "Blue Comforter", category: { name: "Comforters" }, price: 553, user: "u1", email: "x@example.com" };
const reset = () => calls.splice(0, calls.length);

test("product clicks from a homepage section keep product_list and add item_list_id", () => {
  reset();
  trackSelectItem(PRODUCT, "product_list", "home_new_arrivals");
  assert.equal(calls.length, 1);
  const [kind, name, params] = calls[0];
  assert.equal(kind, "event");
  assert.equal(name, "select_item");
  assert.deepEqual(Object.keys(params).sort(), ["item_list_id", "item_list_name", "items"]);
  assert.equal(params.item_list_name, "product_list");
  assert.equal(params.item_list_id, "home_new_arrivals");
  assert.deepEqual(params.items, [{ item_id: "p1", item_name: "Blue Comforter", item_category: "Comforters", price: 553 }]);
});

test("every other select_item call is exactly as before (no item_list_id key)", () => {
  reset();
  trackSelectItem(PRODUCT);
  trackSelectItem(PRODUCT, "home_trending");
  assert.deepEqual(Object.keys(calls[0][2]).sort(), ["item_list_name", "items"]);
  assert.equal(calls[0][2].item_list_name, "product_list");
  assert.equal(calls[1][2].item_list_name, "home_trending");
  assert.ok(!("item_list_id" in calls[1][2]));
});

test("section link clicks send select_content with only approved keys", () => {
  reset();
  trackHomeSectionClick("home_shop_by_price", 499);
  trackHomeSectionClick("home_category_grid", "bedsheets");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["event", "select_content", { content_type: "home_section", home_section: "home_shop_by_price", item_id: "499" }]);
  assert.deepEqual(calls[1][2], { content_type: "home_section", home_section: "home_category_grid", item_id: "bedsheets" });
});

test("only known sections are sent, and the target is a short slug-like string", () => {
  reset();
  trackHomeSectionClick("not_a_section", "bedsheets");
  trackHomeSectionClick("home_quick_links", "someone@example.com");
  trackHomeSectionClick("home_quick_links", { email: "x@example.com" });
  assert.equal(calls.length, 0);
  assert.deepEqual([...HOME_SECTIONS].sort(), [
    "home_category_grid", "home_clearance", "home_new_arrivals", "home_quick_links", "home_shop_by_price", "home_size_showcase",
  ]);
});

test("scroll events: home_scroll_<depth> with no parameters, known depths only", () => {
  reset();
  trackHomeScroll(50);
  trackHomeScroll(33);
  assert.deepEqual(calls, [["event", "home_scroll_50", {}]]);
  assert.deepEqual(SCROLL_DEPTHS, [25, 50, 75, 90]);
});

test("without gtag nothing is sent and nothing throws (localhost, /admin, unsubscribe pages)", () => {
  const saved = globalThis.window.gtag;
  delete globalThis.window.gtag;
  reset();
  assert.doesNotThrow(() => {
    trackSelectItem(PRODUCT, "product_list", "home_clearance");
    trackHomeSectionClick("home_size_showcase", "king-size");
    trackHomeScroll(90);
  });
  globalThis.window.gtag = saved;
  assert.equal(calls.length, 0);
});

test("scroll tracker: each depth once, jumps send every crossed depth, in order", () => {
  const sent = [];
  const check = createScrollDepthTracker((d) => sent.push(d));
  // scrollable = 10000 - 1000 = 9000
  check(1000, 10000, 1000); // 11%
  check(2300, 10000, 1000); // 25.5%
  check(2300, 10000, 1000); // same again
  check(8200, 10000, 1000); // 91% -> 50, 75, 90
  check(9000, 10000, 1000);
  check(0, 10000, 1000);
  check(9000, 10000, 1000); // back down and up again
  assert.deepEqual(sent, [25, 50, 75, 90]);
});

test("scroll tracker: resize / page growth never re-sends a depth", () => {
  const sent = [];
  const check = createScrollDepthTracker((d) => sent.push(d));
  check(4600, 10000, 1000); // 51% -> 25, 50
  check(4600, 20000, 1000); // page grew: now 24%
  check(4600, 10000, 700); // viewport resized
  check(9600, 20000, 1000); // 50% of the grown page
  assert.deepEqual(sent, [25, 50]);
});

test("scroll tracker: a page that can't scroll sends nothing", () => {
  const sent = [];
  const check = createScrollDepthTracker((d) => sent.push(d));
  check(0, 800, 1000);
  check(0, 1000, 1000);
  assert.deepEqual(sent, []);
});

test("each homepage section is wired with its own section name", () => {
  assert.match(read("components/Categories/Categories.jsx"), /trackHomeSectionClick\("home_category_grid"/);
  assert.match(read("components/CategoryQuickLinks/CategoryQuickLinks.jsx"), /trackHomeSectionClick\("home_quick_links"/);
  assert.match(read("components/SubcategoryShowcase/SubcategoryRow.jsx"), /trackHomeSectionClick\("home_size_showcase"/);
  assert.match(read("components/PriceShowcase/PriceShowcase.jsx"), /trackHomeSectionClick\("home_shop_by_price"/);
  const na = read("components/NewArrivals/CategoryNewArrivals.jsx");
  assert.match(na, /listId="home_new_arrivals"/);
  assert.match(na, /trackHomeSectionClick\("home_new_arrivals"/);
  const cl = read("components/ClearanceSale/ClearanceSale.jsx");
  assert.match(cl, /trackSelectItem\(product, "product_list", "home_clearance"\)/);
  assert.match(cl, /trackHomeSectionClick\("home_clearance"/);
});

test("Recently Viewed: home_recently_viewed only on the homepage, product page unchanged", () => {
  assert.match(read("pages/Home.jsx"), /<RecentlyViewed listId="home_recently_viewed"\s*\/>/);
  const pd = read("pages/ProductDetails.jsx");
  assert.match(pd, /<RecentlyViewed\b/);
  assert.doesNotMatch(pd, /listId=/);
});

test("ProductGrid/ProductCard pass listId through and keep the old default", () => {
  const card = read("components/ProductCard/ProductCard.jsx");
  assert.match(card, /trackSelectItem\(product, listName, listId\)/);
  assert.match(read("components/ProductGrid/ProductGrid.jsx"), /listId=\{listId\}/);
});

test("Home.jsx: one scroll tracker per homepage view, listener added once and removed", () => {
  const home = read("pages/Home.jsx");
  assert.match(home, /createScrollDepthTracker\(/);
  assert.match(home, /addEventListener\("scroll"/);
  assert.match(home, /removeEventListener\("scroll"/);
  assert.match(home, /\}, \[\]\);/);
});
