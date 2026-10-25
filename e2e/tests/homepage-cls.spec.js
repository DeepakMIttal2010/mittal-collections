import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// Homepage layout stability (desktop):
//  - the hero title wraps the same in the metric-adjusted fallback font as
//    in Playfair Display, so the font swap doesn't move the hero text;
//  - the header's delivery-location slot exists from the first render, so
//    the search box doesn't move when the location API answers;
//  - autoplay slide changes don't move the hero or anything below it.
// /api/banners answers with the build snapshot so slides are known; the
// fake clock is paused before load so autoplay only moves via runFor.

const BANNERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../client/src/data/heroBannersSnapshot.json"), "utf8"),
);
const PLAYFAIR_CSS = /fonts\.googleapis\.com\/css2\?family=Playfair/;

async function common(page) {
  await page.route("**/api/banners", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, banners: BANNERS }) }),
  );
  await page.addInitScript(() => {
    window.__shifts = [];
    if (!PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) return;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        const where = e.sources.map((s) => {
          const el = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement);
          if (!el) return "removed";
          if (el.closest("header")) return "header";
          if (el.closest(".hero")) return "hero";
          return "other";
        });
        window.__shifts.push({ value: e.value, where });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}
async function openPaused(page, url) {
  const start = new Date();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await page.goto(url);
}
const shiftSum = (page, filter) =>
  page.evaluate((f) => window.__shifts.filter((s) => s.where.some((w) => f.includes(w))).reduce((a, s) => a + s.value, 0), filter);
const slideCount = (page) => page.locator(".hero-dot").count();
const showSlide = (page, i) => page.evaluate((j) => document.querySelectorAll(".hero-dot")[j].click(), i);
const titleHeights = async (page) => {
  const heights = [];
  for (let i = 0; i < (await slideCount(page)); i++) {
    await showSlide(page, i);
    heights.push(await page.evaluate(() => Math.round(document.querySelector(".hero .hero-split-title").getBoundingClientRect().height)));
  }
  return heights;
};

test.describe("Hero font fallback", () => {
  for (const url of ["/", "/hi"]) {
    test(`title wraps the same in the adjusted fallback as in Playfair Display (${url})`, async ({ browser, viewport }) => {
      test.setTimeout(120000); // two full page loads, every slide in each
      const measure = async (blockPlayfair) => {
        const ctx = await browser.newContext({ viewport });
        const page = await ctx.newPage();
        await common(page);
        if (blockPlayfair) await page.route(PLAYFAIR_CSS, (r) => r.abort());
        await page.goto(url);
        await expect(page.locator(".hero .hero-split-title")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        // The adjusted stand-ins are local fonts (Georgia / Noto Serif); on a
        // machine with neither (e.g. stock Linux CI) the CSS falls through to
        // unadjusted fonts and there is nothing to compare.
        const fallbackAvailable = await page.evaluate(async () => {
          for (const src of ['local("Georgia Bold")', 'local("Georgia-Bold")', 'local("Noto Serif Bold")', 'local("NotoSerif-Bold")']) {
            try { await new FontFace("probe", src, { weight: "700" }).load(); return true; } catch { /* not installed */ }
          }
          return false;
        });
        // document.fonts.check() is true when no such face is registered at
        // all, so look for a loaded Playfair Display face instead.
        // Local fallback faces load lazily (Firefox can paint unadjusted
        // Georgia for a moment); compare the faces themselves, once loaded.
        if (fallbackAvailable) await page.evaluate(() => document.fonts.load('700 48px "Playfair Display Fallback"'));
        const playfair = await page.evaluate(() =>
          [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "Playfair Display" && f.status === "loaded"),
        );
        const heights = await titleHeights(page);
        await ctx.close();
        return { heights, fallbackAvailable, playfair };
      };
      const fallback = await measure(true);
      test.skip(!fallback.fallbackAvailable, "neither Georgia nor Noto Serif is installed locally, so the adjusted fallback can't apply here");
      expect(fallback.playfair).toBe(false);
      const loaded = await measure(false);
      test.skip(!loaded.playfair, "Playfair Display didn't load (no network access to Google Fonts)");
      expect(fallback.heights).toEqual(loaded.heights);
    });
  }
});

test.describe("Header delivery location (desktop)", () => {
  test.skip(({ viewport }) => !viewport || viewport.width < 768, "desktop header only");

  for (const width of [1366, 1024]) {
    test(`search box keeps its position and width when the location API answers late (${width}px)`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: 768 });
      await common(page);
      await page.route("**/api/analytics/my-location", async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.continue();
      });
      await page.goto("/");
      const form = page.locator("header form[class*='md:flex']");
      await expect(form).toBeVisible();
      const before = await form.boundingBox();
      await page.waitForTimeout(4500);
      const after = await form.boundingBox();
      expect(Math.round(after.x)).toBe(Math.round(before.x));
      expect(Math.round(after.width)).toBe(Math.round(before.width));
      if (browserName === "chromium") expect(await shiftSum(page, ["header"])).toBeLessThan(0.001);
    });
  }

  test("below 1024px the delivery slot stays hidden, as before", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 768 });
    await common(page);
    await page.goto("/");
    await expect(page.locator("header").getByText("Deliver to", { exact: false })).toBeHidden();
  });
});

test.describe("Hero autoplay (desktop)", () => {
  test.skip(({ viewport }) => !viewport || viewport.width < 768, "desktop only");
  test.skip(BANNERS.length < 3, "needs at least 3 banners in the snapshot");

  for (const [width, url] of [[1366, "/"], [1024, "/"], [1366, "/hi"], [1024, "/hi"]]) {
    test(`no layout shift on any autoplay transition (${width}px ${url})`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "layout-shift entries are Chromium-only");
      await page.setViewportSize({ width, height: 768 });
      await common(page);
      await openPaused(page, url);
      await expect(page.locator(".hero .hero-split-title")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const base = await shiftSum(page, ["hero", "other"]);
      const n = await slideCount(page);
      for (let i = 0; i < n; i++) {
        const before = await page.locator(".hero .hero-split-title").textContent();
        await page.clock.runFor(6000);
        await expect(page.locator(".hero .hero-split-title")).not.toHaveText(before);
      }
      expect((await shiftSum(page, ["hero", "other"])) - base).toBeLessThan(0.001);
    });
  }
});

test.describe("Hero on mobile (no height change without approval)", () => {
  test.skip(({ viewport }) => !viewport || viewport.width >= 768, "mobile only");

  test("mobile content column keeps its existing min-height", async ({ page }) => {
    await common(page);
    await page.goto("/");
    await expect(page.locator(".hero .hero-split-content")).toHaveCSS("min-height", "310px");
  });
});
