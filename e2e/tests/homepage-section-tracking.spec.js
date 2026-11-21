import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// Homepage section tracking (2026-11-21): clicking a homepage section's
// link sends one GA4 select_content with that section's name, and scrolling
// the homepage sends home_scroll_25/50/75/90 once each. The UI itself is
// unchanged.
//
// gtag is never loaded on localhost (index.html), so a recording stub is
// installed here. The categories / subcategories / price-ranges APIs are
// mocked (CI seeds different data) so every section renders.

const CATEGORIES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../client/src/data/navCategoriesSnapshot.json"), "utf8"),
);
const bedsheets = CATEGORIES.find((c) => c.slug === "bedsheets");
const SUBCATEGORIES = [
  {
    _id: "size-king", name: "King Size", nameHi: "किंग साइज़", slug: "king-size", groupLabel: "Size",
    category: { _id: bedsheets._id, slug: bedsheets.slug, name: bedsheets.name }, isActive: true, productCount: 9,
  },
];
const PRICE_RANGES = [
  { _id: "pr-499", label: "Under 499", maxPrice: 499, isActive: true, displayOrder: 1 },
];

const sectionEvents = (page) =>
  page.evaluate(() => window.__ga.filter((c) => c[0] === "event" && c[1] === "select_content").map((c) => c[2]));
const scrollEvents = (page) =>
  page.evaluate(() => window.__ga.filter((c) => c[0] === "event" && /^home_scroll_/.test(c[1])).map((c) => c[1]));

test.describe("homepage section tracking", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__ga = [];
      window.gtag = (...args) => window.__ga.push(args);
    });
    await page.route("**/api/categories", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, categories: CATEGORIES }) }),
    );
    await page.route("**/api/subcategories", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, subcategories: SUBCATEGORIES }) }),
    );
    await page.route("**/api/price-ranges", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, priceRanges: PRICE_RANGES }) }),
    );
  });

  test("a Shop by Price card sends one select_content for home_shop_by_price", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("button", { name: /499/ }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page).toHaveURL(/\/price\/499$/);
    expect(await sectionEvents(page)).toEqual([
      { content_type: "home_section", home_section: "home_shop_by_price", item_id: "499" },
    ]);
  });

  test("a size card sends one select_content for home_size_showcase", async ({ page }) => {
    await page.goto("/");
    const card = page.locator('a[href="/category/bedsheets/king-size"]').first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page).toHaveURL(/\/category\/bedsheets\/king-size$/);
    expect(await sectionEvents(page)).toEqual([
      { content_type: "home_section", home_section: "home_size_showcase", item_id: "king-size" },
    ]);
  });

  test("a category grid card sends one select_content for home_category_grid", async ({ page }) => {
    await page.goto("/");
    // The grid (section#shop-categories), not the quick links above it.
    const card = page.locator('#shop-categories a[href="/category/curtains"]:has(h3)').first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page).toHaveURL(/\/category\/curtains$/);
    const events = await sectionEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ content_type: "home_section", home_section: "home_category_grid", item_id: "curtains" });
  });

  test("scrolling to the bottom sends 25/50/75/90 once each, even after scrolling again", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    for (const f of [0.3, 0.6, 1, 0.1, 1, 0.5, 1]) {
      await page.evaluate((x) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), f);
      await page.waitForTimeout(150);
    }
    await page.setViewportSize({ width: 900, height: 700 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    expect(await scrollEvents(page)).toEqual(["home_scroll_25", "home_scroll_50", "home_scroll_75", "home_scroll_90"]);
  });

  test("other pages send no homepage scroll events", async ({ page }) => {
    await page.goto("/category/bedsheets");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    expect(await scrollEvents(page)).toEqual([]);
  });
});
