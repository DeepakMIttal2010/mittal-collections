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
  ["/gifting", "GiftingPage", /Gifting/],
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
