import { test, expect } from "@playwright/test";

// Landing pages (/new-arrivals, /hi/new-arrivals, /trending, /clearance-sale,
// /gifting) on a first load: main.jsx preloads the page's own chunk before
// the first render (see preloadableRoute in AppRoutes.jsx), so the layout
// and footer never paint first and get pushed down when the page arrives
// (was desktop CLS ~0.17 live). The page module is held back to make the
// old gap visible: a slow chunk must still not move anything.

const DELAY_MS = 800;
const PAGES = [
  ["/new-arrivals", "NewArrivalsPage", /New Arrivals/],
  ["/hi/new-arrivals", "NewArrivalsPage", /नए प्रोडक्ट्स/],
  ["/trending", "TrendingPage", /Top Trending/],
  ["/clearance-sale", "ClearanceSalePage", /Clearance Sale/],
  ["/gifting", "GiftingPage", /Home Furnishing Gifts for Every Occasion/],
];

// vite dev transforms each module (the page and everything it imports) on
// its first request; a cold compile on top of DELAY_MS can pass main.jsx's
// 3 s preload cap and fall back to the lazy route -- by design, and
// dev-server timing, not what this spec checks. Load every page once first.
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  for (const [path] of PAGES) {
    await page.goto(path);
    await page.locator("h1").first().waitFor({ timeout: 30000 });
  }
  await page.close();
});

async function loadWithSlowChunk(page, path, moduleName) {
  const started = Date.now();
  let chunkDoneMs = null;
  const pattern = new RegExp(`/src/pages/${moduleName}\\.jsx`);
  page.on("requestfinished", (request) => {
    if (pattern.test(request.url())) chunkDoneMs = Date.now() - started;
  });
  await page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__cls = 0;
    if (!PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) return;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(path);
  return () => chunkDoneMs;
}

for (const [path, moduleName, heading] of PAGES) {
  test(`${path}: no layout shift on first load with a slow page chunk`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "layout-shift entries are Chromium-only");
    const chunkDoneMs = await loadWithSlowChunk(page, path, moduleName);
    await expect(page.locator("h1").first()).toHaveText(heading, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const cls = await page.evaluate(() => window.__cls);
    expect(cls, `page chunk finished ${chunkDoneMs()}ms after navigation`).toBeLessThan(0.01);
  });
}

test("/hi/new-arrivals is the Hindi page: lang, canonical, hreflang, Hindi links", async ({ page }) => {
  await page.goto("/hi/new-arrivals");
  await expect(page.locator("h1").first()).toHaveText("नए प्रोडक्ट्स", { timeout: 20000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/hi\/new-arrivals$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/new-arrivals$/);
  await expect(page.locator('link[rel="alternate"][hreflang="hi"]')).toHaveAttribute("href", /\/hi\/new-arrivals$/);
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/new-arrivals$/);
  await expect(page.getByText("Page Not Found")).toHaveCount(0);
});

// /gifting's bulk-gifting WhatsApp box needs the shop phone from
// /api/settings. Live, settings often lands after the product grid has
// painted, and inserting the box then pushed the grid down ~128px (CLS
// 0.044 desktop / 0.054 mobile, 2026-11-16). Its space is now held from
// the first render. Both APIs are mocked so the timing (and the data) is
// the same on every machine: products answer at once, settings 1.5 s later.
const SETTINGS_DELAY_MS = 1500;
const GIFT_CATEGORY = { _id: "gift-test-cat", name: "Bedsheets", nameHi: "बेडशीट", slug: "bedsheets" };
const GIFT_PRODUCTS = Array.from({ length: 8 }, (_, i) => ({
  _id: `gift-test-${i}`,
  name: `Gift Test Bedsheet ${i + 1}`,
  slug: `gift-test-bedsheet-${i + 1}`,
  price: 500 + i * 10,
  stock: 5,
  images: [],
  category: GIFT_CATEGORY,
  subcategories: [],
  variants: [],
  isGiftingItem: true,
}));
const GIFT_SETTINGS = {
  phone: "+91 99999 99999",
  freeShippingThreshold: 499,
  deliveryFee: 0,
  shippingTiers: [],
  defaultReturnPeriodDays: 7,
  codCharge: 50,
};

async function mockGiftingApis(page, settings = GIFT_SETTINGS, settingsDelayMs = SETTINGS_DELAY_MS) {
  await page.route("**/api/products/gifting**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, sections: [{ category: GIFT_CATEGORY, products: GIFT_PRODUCTS }] }),
    }),
  );
  await page.route("**/api/settings", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, settingsDelayMs));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, settings }) });
  });
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__shifts = [];
    if (!PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) return;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        window.__shifts.push(
          `${e.value.toFixed(4)} @${Math.round(e.startTime)}ms ` +
            (e.sources || []).map((s) => `${s.node?.nodeName}.${s.node?.className} y${s.previousRect.y}->${s.currentRect.y}`).join(", "),
        );
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

test("/gifting: late settings (bulk WhatsApp box) do not shift the product grid", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "layout-shift entries are Chromium-only");
  await mockGiftingApis(page);
  await page.goto("/gifting");
  await expect(page.locator("h1").first()).toHaveText(/Home Furnishing Gifts for Every Occasion/, { timeout: 20000 });
  await expect(page.getByText("Gift Test Bedsheet 1")).toBeVisible();
  // The real link replaces the placeholder once settings answer.
  const bulkLink = page.locator('a[href*="wa.me"][href*="bulk"]');
  await expect(bulkLink).toBeVisible({ timeout: 10000 });
  await expect(bulkLink).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("bulk-gifting-placeholder")).toHaveCount(0);
  await page.waitForTimeout(1000);
  const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
  expect(cls, shifts.join("\n")).toBeLessThan(0.01);
});

test("/gifting: while settings load, the held space is invisible and not clickable", async ({ page }) => {
  // Long delay so the checks below always run while settings are pending.
  await mockGiftingApis(page, GIFT_SETTINGS, 8000);
  await page.goto("/gifting");
  const placeholder = page.getByTestId("bulk-gifting-placeholder");
  await expect(placeholder).toBeAttached({ timeout: 20000 });
  await expect(placeholder).toBeHidden();
  await expect(placeholder).toHaveAttribute("aria-hidden", "true");
  await expect(placeholder.locator("a")).toHaveCount(0);
});

test("/gifting: settings without a phone leave no empty gap", async ({ page }) => {
  await mockGiftingApis(page, { ...GIFT_SETTINGS, phone: "" });
  await page.goto("/gifting");
  await expect(page.getByText("Gift Test Bedsheet 1")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("bulk-gifting-placeholder")).toHaveCount(0, { timeout: SETTINGS_DELAY_MS + 5000 });
  await expect(page.locator('a[href*="wa.me"][href*="bulk"]')).toHaveCount(0);
});

// PR-G2: the gifting guide under the listing (same text bots get from
// api/render.js). It renders only once products have loaded, so it never
// sits under the skeleton and jumps.
test("/gifting: guide renders after the products, with the Gift Bedsheets link", async ({ page }) => {
  await mockGiftingApis(page);
  // Hold the products back; the guide must not show before them.
  let releaseProducts;
  const productsHeld = new Promise((resolve) => (releaseProducts = resolve));
  await page.route("**/api/products/gifting**", async (route) => {
    await productsHeld;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, sections: [{ category: GIFT_CATEGORY, products: GIFT_PRODUCTS }] }),
    });
  });
  await page.goto("/gifting");
  await expect(page.locator("h1").first()).toHaveText(/Home Furnishing Gifts for Every Occasion/, { timeout: 20000 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId("gifting-guide")).toHaveCount(0);
  releaseProducts();
  const guide = page.getByTestId("gifting-guide");
  await expect(guide).toBeVisible({ timeout: 10000 });
  await expect(guide.locator("h2")).toHaveText("Choosing a Home Furnishing Gift");
  await expect(guide.getByRole("link", { name: "Gift Bedsheets" })).toHaveAttribute("href", "/category/bedsheets/gift-bedsheet");
  await expect(guide).toContainText("eligible PIN codes in Uttar Pradesh");
  // Below the last product card.
  const lastCard = await page.getByText("Gift Test Bedsheet 8").boundingBox();
  const guideBox = await guide.boundingBox();
  expect(guideBox.y).toBeGreaterThan(lastCard.y);
});

test("/gifting: in Hindi the guide is Hindi and links to the Hindi Gift Bedsheet page", async ({ page }) => {
  await mockGiftingApis(page);
  await page.goto("/gifting");
  await expect(page.getByTestId("gifting-guide")).toBeVisible({ timeout: 20000 });
  await page.locator("button", { hasText: "हि" }).first().click();
  const guide = page.getByTestId("gifting-guide");
  await expect(guide.locator("h2")).toHaveText("होम फर्निशिंग गिफ्ट कैसे चुनें");
  await expect(guide.getByRole("link", { name: "गिफ्ट बेडशीट" })).toHaveAttribute("href", "/hi/category/bedsheets/gift-bedsheet");
  await expect(page.locator("h1").first()).toHaveText(/हर मौके के लिए होम फर्निशिंग गिफ्ट/);
});
