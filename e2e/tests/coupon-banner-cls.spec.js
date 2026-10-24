import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// CouponBanner sits above the header. With an empty localStorage it used
// to render nothing until GET /api/coupons/banner answered, then push the
// header, nav and hero down (42px desktop / 57px mobile) -- the homepage's
// largest layout shift. It now starts from a build-time snapshot.
// Every test uses Playwright's fresh context (empty localStorage) and
// holds the coupon API back, so it checks the state BEFORE the API answers.

const snapshot = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../client/src/data/bannerCouponSnapshot.json"), "utf8"),
).coupon;
const BANNER = '[data-testid="coupon-banner"]';
const API_DELAY_MS = 2500;

async function holdCouponApi(page, respond = (route) => route.continue()) {
  await page.route("**/api/coupons/banner", async (route) => {
    await new Promise((r) => setTimeout(r, API_DELAY_MS));
    await respond(route);
  });
}

// Records (1) whether the banner exists in the same render the header first
// appears in, and (2) layout shifts that MOVE the header, nav or hero
// section themselves vertically -- what the late banner caused. Shifts
// inside the hero (slide text) or sideways nav-link changes are other
// issues and aren't counted here.
async function instrument(page) {
  await page.addInitScript((banner) => {
    window.__bannerAtFirstHeader = null;
    const mo = new MutationObserver(() => {
      if (document.querySelector("header")) {
        window.__bannerAtFirstHeader = Boolean(document.querySelector(banner));
        mo.disconnect();
      }
    });
    mo.observe(document, { childList: true, subtree: true });

    window.__layoutShift = 0;
    if (PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          const moved = e.sources.some(
            (s) =>
              s.node?.nodeType === 1 &&
              s.node.matches("header, nav, section.hero") &&
              Math.abs(s.previousRect.y - s.currentRect.y) >= 1,
          );
          if (moved) window.__layoutShift += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
  }, BANNER);
}

test.describe("Coupon banner on a first visit", () => {
  test.skip(!snapshot, "no banner coupon in the build snapshot");

  test.beforeEach(async ({ page }) => {
    await instrument(page);
  });

  test("is in the first render, before the coupon API answers", async ({ page }) => {
    await holdCouponApi(page);
    await page.goto("/");
    await expect(page.locator("header").first()).toBeVisible();
    expect(await page.evaluate(() => window.__bannerAtFirstHeader)).toBe(true);
    await expect(page.locator(BANNER)).toContainText(snapshot.code);
  });

  test("does not push the header, nav or hero down", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "layout-shift entries are Chromium-only");
    await holdCouponApi(page);
    await page.goto("/");
    await page.waitForTimeout(5000);
    await expect(page.locator(BANNER)).toBeVisible();
    expect(await page.evaluate(() => window.__layoutShift)).toBeLessThan(0.005);
  });

  test("a coupon dismissed this session does not come back from the snapshot", async ({ page }) => {
    await page.addInitScript((code) => sessionStorage.setItem("mc_banner_dismissed_code", code), snapshot.code);
    await holdCouponApi(page);
    await page.goto("/");
    await expect(page.locator("header").first()).toBeVisible();
    expect(await page.evaluate(() => window.__bannerAtFirstHeader)).toBe(false);
    await page.waitForTimeout(API_DELAY_MS + 1000);
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("an unreachable coupon API keeps the banner instead of collapsing it", async ({ page }) => {
    await holdCouponApi(page, (route) => route.abort());
    await page.goto("/");
    await page.waitForTimeout(API_DELAY_MS + 1000);
    await expect(page.locator(BANNER)).toBeVisible();
  });

  test("an API saying there is no coupon hides it and is remembered on the next visit", async ({ page }) => {
    await holdCouponApi(page, (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, coupon: null }) }),
    );
    await page.goto("/");
    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0, { timeout: API_DELAY_MS + 5000 });
    expect(await page.evaluate(() => localStorage.getItem("mc_banner_coupon_cache"))).toBe("null");

    await page.reload();
    await expect(page.locator("header").first()).toBeVisible();
    expect(await page.evaluate(() => window.__bannerAtFirstHeader)).toBe(false);
  });
});

// Browsers that visited before the snapshot existed hold the OLD cache
// format: the full API coupon object (with _id, description, isActive...).
test.describe("Coupon banner with an existing (legacy) cache", () => {
  test.skip(!snapshot, "no banner coupon in the build snapshot");

  const legacy = (overrides) =>
    JSON.stringify({
      _id: "6a6ddb09fbd11b01b16cfeff",
      code: "WELCOME10",
      discountType: "percentage",
      discountValue: 10,
      maxDiscount: 1000,
      firstOrderOnly: true,
      description: "10% off your first order, up to ₹1000",
      showAsBanner: true,
      isActive: true,
      __v: 0,
      ...overrides,
    });
  const seedStorage = (page, cache, dismissed) =>
    page.addInitScript(
      ([c, d]) => {
        if (c !== null) localStorage.setItem("mc_banner_coupon_cache", c);
        if (d) sessionStorage.setItem("mc_banner_dismissed_code", d);
      },
      [cache, dismissed],
    );

  test.beforeEach(async ({ page }) => {
    await instrument(page);
  });

  test("a valid legacy entry is rendered first, then corrected by the API", async ({ page }) => {
    // A different code than the API's, to tell cache, snapshot and API apart.
    await seedStorage(page, legacy({ code: "OLDCACHE50", discountType: "flat", discountValue: 50 }));
    await holdCouponApi(page);
    await page.goto("/");
    await expect(page.locator("header").first()).toBeVisible();
    expect(await page.evaluate(() => window.__bannerAtFirstHeader)).toBe(true);
    await expect(page.locator(BANNER)).toContainText("OLDCACHE50");

    await expect(page.locator(BANNER)).not.toContainText("OLDCACHE50", { timeout: API_DELAY_MS + 5000 });
    const cached = JSON.parse(await page.evaluate(() => localStorage.getItem("mc_banner_coupon_cache")));
    expect(cached.code).not.toBe("OLDCACHE50");
    expect(Object.keys(cached).sort()).toEqual(["code", "discountType", "discountValue", "firstOrderOnly", "maxDiscount"]);
  });

  test("a legacy entry dismissed this session stays hidden before and after the API answers", async ({ page }) => {
    await seedStorage(page, legacy({}), "WELCOME10");
    await holdCouponApi(page);
    await page.goto("/");
    await expect(page.locator("header").first()).toBeVisible();
    expect(await page.evaluate(() => window.__bannerAtFirstHeader)).toBe(false);
    await page.waitForTimeout(API_DELAY_MS + 1000);
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  for (const [label, raw] of [
    ["unparseable JSON", "{not json"],
    ["an empty code", legacy({ code: "" })],
    ["an unknown discount type", legacy({ discountType: "bogo" })],
    ["a bare string", JSON.stringify("WELCOME10")],
  ]) {
    test(`a malformed entry (${label}) falls back to the snapshot`, async ({ page }) => {
      await seedStorage(page, raw);
      await holdCouponApi(page);
      await page.goto("/");
      await expect(page.locator("header").first()).toBeVisible();
      expect(await page.evaluate(() => window.__bannerAtFirstHeader)).toBe(true);
      await expect(page.locator(BANNER)).toContainText(snapshot.code);
    });
  }
});
