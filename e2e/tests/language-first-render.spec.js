import { test, expect } from "@playwright/test";

import { getSeededProductPath } from "./helpers";

// The site language used to start from localStorage and was only synced to
// the URL after the page's data loaded. On mobile the delivery banner is 2
// lines in English and 1 in Hindi, so that late flip shifted the whole page
// (live lab CLS 0.145-0.209 on /hi pages, and 0.145 on English pages for a
// visitor whose saved language was "hi"). Bilingual pages now start in the
// URL's language. Desktop never showed it: the banner is 1 line in both.

// The English banner itself contains one Hindi word ("आसपास"), so match the
// fixed headline in each language instead of "any Devanagari".
const HINDI_BANNER = /तेज़ डिलीवरी|उत्तर प्रदेश में डिलीवरी/;
const ENGLISH_BANNER = /FAST DELIVERY|Delivery in Uttar Pradesh/;

// Records the delivery banner's text the first time it appears, plus every
// layout shift, before any app code runs.
async function watch(page, savedLanguage) {
  await page.addInitScript((saved) => {
    if (saved && !sessionStorage.getItem("__e2eLangSet")) {
      localStorage.setItem("language", saved);
      sessionStorage.setItem("__e2eLangSet", "1");
    }
    window.__firstBannerText = null;
    window.__shifts = [];
    window.__bannerTimeline = []; // [{ lang, path }] each time the banner's language changes
    let lastLang = null;
    const grab = () => {
      const el = document.querySelector("[class*='from-orange-600']");
      if (!el || !el.textContent.trim()) return;
      if (window.__firstBannerText === null) window.__firstBannerText = el.textContent.trim();
      const lang = /तेज़ डिलीवरी|उत्तर प्रदेश में डिलीवरी/.test(el.textContent) ? "hi" : "en";
      if (lang !== lastLang) { lastLang = lang; window.__bannerTimeline.push({ lang, path: location.pathname }); }
    };
    new MutationObserver(grab).observe(document, { childList: true, subtree: true, characterData: true });
    if (PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push(e.value);
      }).observe({ type: "layout-shift", buffered: true });
    }
  }, savedLanguage);
}

const firstBanner = (page) => page.waitForFunction(() => window.__firstBannerText, null, { timeout: 20000 }).then((h) => h.jsonValue());
const cls = (page) => page.evaluate(() => window.__shifts.reduce((a, v) => a + v, 0));

// Client-side navigation as a user click: an injected button whose click
// does what React Router does for a link/Back (history + popstate). Being a
// real click, the browser ignores shifts in the next 500ms as it would for a
// real link, so only a LATE language flip (after the page's data) counts.
async function clickNavigate(page, path) {
  await page.evaluate((p) => {
    window.__shifts = [];
    window.__bannerTimeline = [];
    const b = document.createElement("button");
    b.id = "__e2e-nav";
    b.textContent = "go";
    b.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647";
    b.onclick = () => { b.remove(); history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); };
    document.body.appendChild(b);
  }, path);
  await page.click("#__e2e-nav");
}

test.describe("language comes from the URL on the first render", () => {
  test("fresh visitor on /hi: banner is Hindi from its first paint, no shift", async ({ page }) => {
    await watch(page, null);
    await page.goto("/hi");
    expect(await firstBanner(page)).toMatch(HINDI_BANNER);
    await page.waitForTimeout(2500);
    expect(await cls(page)).toBeLessThan(0.01);
    expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("hi");
  });

  // Home syncs the language immediately, so it never showed the flip; category
  // and product pages wait for their data first, which is where it happened.
  // (Seed categories/products have no Hindi names, so their /hi/ URLs redirect
  // locally; the English-URL-with-saved-"hi" case exercises the same path.)
  for (const [label, getPath] of [
    ["home", async () => "/"],
    ["category", async () => "/category/bedsheets"],
    ["product", async () => (await getSeededProductPath()).path],
  ]) {
    test(`saved 'hi' visitor on an English ${label} page: banner is English from its first paint, no shift`, async ({ page }) => {
      const path = await getPath();
      await watch(page, "hi");
      await page.goto(path);
      expect(await firstBanner(page)).toMatch(ENGLISH_BANNER);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(2500);
      expect(await cls(page)).toBeLessThan(0.01);
      expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("en");
    });
  }

  test("saved 'hi' still applies on a page with no Hindi route (/cart)", async ({ page }) => {
    await watch(page, "hi");
    await page.goto("/cart");
    expect(await firstBanner(page)).toMatch(HINDI_BANNER);
  });

  test("/hi/ URL with no Hindi route keeps the saved language (en)", async ({ page }) => {
    await watch(page, "en");
    await page.goto("/hi/contact");
    expect(await firstBanner(page)).toMatch(ENGLISH_BANNER);
  });

  test("product without a Hindi name: /hi/ URL redirects to English once, no loop", async ({ page }) => {
    const product = await getSeededProductPath(); // seed products have no nameHi
    await watch(page, null);
    const urls = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) urls.push(new URL(f.url()).pathname); });
    const englishUrl = new RegExp(`^/product/${product.id}(/|$)`);
    await page.goto(`/hi/product/${product.id}`);
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 20000 }).toMatch(englishUrl);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20000 });
    const settled = new URL(page.url()).pathname;
    await page.waitForTimeout(3000);
    expect(new URL(page.url()).pathname).toBe(settled);
    // framenavigated fires more than once per navigation; a loop would show
    // the /hi/ URL again after the English one, or keep adding entries.
    const distinct = [...new Set(urls)];
    expect(distinct.filter((u) => u.startsWith("/hi/")).length).toBe(1);
    expect(urls.lastIndexOf(urls.find((u) => u.startsWith("/hi/")))).toBeLessThan(urls.findIndex((u) => englishUrl.test(u)));
    expect(urls.length).toBeLessThanOrEqual(6);
    // The language follows the English URL it landed on (it used to stay "hi"
    // with a Hindi banner on the English page).
    expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("en");
    expect(await page.evaluate(() => document.querySelector("[class*='from-orange-600']")?.textContent || "")).toMatch(ENGLISH_BANNER);
  });
  test("client-side navigation from /cart (saved 'hi') to an English category: switches with the navigation, before the data", async ({ page }) => {
    await watch(page, "hi");
    await page.goto("/cart");
    expect(await firstBanner(page)).toMatch(HINDI_BANNER);
    // Slow the category page's data down (as on a slow mobile network) so a
    // language switch that waits for the data shows up as a late flip.
    let slow = false;
    await page.route("**/api/**", async (route) => {
      if (slow && route.request().method() === "GET") await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    slow = true;
    await clickNavigate(page, "/category/bedsheets");
    await page.waitForTimeout(800); // navigation done, data still on its way
    // What a language flip moves: the banner's height and everything under it.
    // (Whole-page CLS isn't used here: the artificially delayed product grid
    // filling in can shift the footer a little, which has nothing to do with
    // the language.)
    const layout = () => page.evaluate(() => ({
      banner: document.querySelector("[class*='from-orange-600']")?.textContent || "",
      bannerHeight: Math.round(document.querySelector("[class*='from-orange-600']")?.getBoundingClientRect().height || 0),
      mainTop: Math.round(document.querySelector("main")?.getBoundingClientRect().top + scrollY),
    }));
    const beforeData = await layout();
    expect(beforeData.banner).toMatch(ENGLISH_BANNER);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(2000);
    const afterData = await layout();
    expect(afterData.bannerHeight).toBe(beforeData.bannerHeight);
    expect(afterData.mainTop).toBe(beforeData.mainTop);
    const timeline = await page.evaluate(() => window.__bannerTimeline);
    expect(timeline).toEqual([{ lang: "en", path: "/category/bedsheets" }]);
    expect(new URL(page.url()).pathname).toBe("/category/bedsheets");
    expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("en");
  });

  test("client-side navigation from an English page to a Hindi page: switches with the navigation, no late flip", async ({ page }) => {
    await watch(page, "en");
    await page.goto("/category/bedsheets");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20000 });
    await clickNavigate(page, "/hi");
    await page.waitForTimeout(3000);
    const timeline = await page.evaluate(() => window.__bannerTimeline);
    expect(timeline).toEqual([{ lang: "hi", path: "/hi" }]);
    expect(await cls(page)).toBeLessThan(0.01);
    expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("hi");
  });

  test("header toggle still works both ways (EN -> HI -> EN)", async ({ page }) => {
    await watch(page, "en");
    await page.goto("/");
    expect(await firstBanner(page)).toMatch(ENGLISH_BANNER);
    await page.locator("button:visible", { hasText: /^(हिंदी|हिं)$/ }).first().click();
    await expect(page).toHaveURL(/\/hi$/, { timeout: 20000 });
    await expect.poll(() => page.evaluate(() => window.__bannerTimeline.at(-1)?.lang)).toBe("hi");
    expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("hi");
    await page.locator("button:visible", { hasText: /^(EN|English)$/ }).first().click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 20000 }).toBe("/");
    await expect.poll(() => page.evaluate(() => window.__bannerTimeline.at(-1)?.lang)).toBe("en");
    expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("en");
  });

  test("localStorage throwing for the language key: no crash, URL language on bilingual pages, English elsewhere", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k) { if (k === "language") throw new DOMException("blocked", "SecurityError"); return get.call(this, k); };
      Storage.prototype.setItem = function (k, v) { if (k === "language") throw new DOMException("blocked", "SecurityError"); return set.call(this, k, v); };
    });
    await watch(page, null);
    await page.goto("/hi");
    expect(await firstBanner(page)).toMatch(HINDI_BANNER);
    await page.goto("/category/bedsheets");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20000 });
    expect(await firstBanner(page)).toMatch(ENGLISH_BANNER);
    await page.goto("/cart");
    expect(await firstBanner(page)).toMatch(ENGLISH_BANNER);
    // the toggle still switches language in memory
    await page.goto("/");
    await page.locator("button:visible", { hasText: /^(हिंदी|हिं)$/ }).first().click();
    await expect(page).toHaveURL(/\/hi$/, { timeout: 20000 });
    expect(errors).toEqual([]);
  });
});
