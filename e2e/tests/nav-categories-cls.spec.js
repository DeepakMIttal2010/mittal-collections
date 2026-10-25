import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// Desktop nav: the category links come from the build-time snapshot
// (client/src/data/navCategoriesSnapshot.json) in the first render, so the
// static links after them (Clearance Sale, Top Trending, ...) no longer
// jump sideways when /api/categories answers. The categories API is held
// back and answered with the snapshot's own categories (CI seeds different
// ones), plus one subcategory so the dropdown can be checked.

const CATEGORIES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../client/src/data/navCategoriesSnapshot.json"), "utf8"),
);
const VISIBLE = CATEGORIES.slice(0, 4);
const SUBCATEGORY = {
  _id: "nav-test-sub",
  name: "Nav Test Subcategory",
  nameHi: "नेव टेस्ट उपश्रेणी",
  slug: "nav-test-subcategory",
  groupLabel: "By Type",
  category: { _id: VISIBLE[0]._id, slug: VISIBLE[0].slug, name: VISIBLE[0].name },
  isActive: true,
};
const DELAY_MS = 3000;
const DESKTOP_NAV = "nav.hidden.md\\:block";

async function setup(page, { categories = "delay" } = {}) {
  await page.route("**/api/categories", async (route) => {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (categories === "fail") return route.abort();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, categories: CATEGORIES }) });
  });
  await page.route("**/api/subcategories", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, subcategories: [SUBCATEGORY] }) }),
  );
  await page.addInitScript((sel) => {
    window.__navAtFirstRender = null;
    const mo = new MutationObserver(() => {
      const nav = document.querySelector(sel);
      if (nav) {
        window.__navAtFirstRender = [...nav.querySelectorAll("a, button")].map((a) => a.textContent.trim()).filter(Boolean);
        mo.disconnect();
      }
    });
    mo.observe(document, { childList: true, subtree: true });
    window.__navShift = 0;
    if (PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          const inNav = e.sources.some((s) => {
            const el = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement);
            return Boolean(el && el.closest(sel));
          });
          if (inNav) window.__navShift += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
  }, "nav.hidden");
}
const navLinks = (page) =>
  page.locator(DESKTOP_NAV).locator("a, button").evaluateAll((els) => els.map((a) => a.textContent.trim()).filter(Boolean));

test.describe("Desktop nav categories", () => {
  test.skip(({ viewport }) => !viewport || viewport.width < 768, "desktop/tablet nav only");
  test.skip(CATEGORIES.length < 5, "needs at least 5 categories in the snapshot");

  test("category links are in the first render, in snapshot order, before the API answers", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await expect(page.locator(DESKTOP_NAV)).toBeVisible();
    const first = await page.evaluate(() => window.__navAtFirstRender);
    expect(first.slice(0, 6)).toEqual(["Home", ...VISIBLE.map((c) => c.name), "More"]);
    expect(first).toContain("Clearance Sale");
  });

  test("no nav layout shift when the categories API answers", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "layout-shift entries are Chromium-only");
    await setup(page);
    await page.goto("/");
    await page.waitForTimeout(DELAY_MS + 2000);
    expect((await navLinks(page)).slice(0, 6)).toEqual(["Home", ...VISIBLE.map((c) => c.name), "More"]);
    expect(await page.evaluate(() => window.__navShift)).toBeLessThan(0.001);
  });

  test("a failed categories API keeps the snapshot links", async ({ page }) => {
    await setup(page, { categories: "fail" });
    await page.goto("/");
    await page.waitForTimeout(DELAY_MS + 1000);
    expect((await navLinks(page)).slice(0, 6)).toEqual(["Home", ...VISIBLE.map((c) => c.name), "More"]);
    await expect(page.locator(DESKTOP_NAV).getByRole("link", { name: VISIBLE[0].name, exact: true })).toHaveAttribute("href", `/category/${VISIBLE[0].slug}`);
  });

  test("the category dropdown still opens with its subcategories", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.waitForTimeout(DELAY_MS + 500);
    await page.locator(DESKTOP_NAV).getByRole("link", { name: VISIBLE[0].name, exact: true }).hover();
    // The panel portals into the div right after the nav (the footer also
    // lists subcategories, so the lookup is scoped to the panel).
    const sub = page.locator(`${DESKTOP_NAV} + div`).getByRole("link", { name: SUBCATEGORY.name });
    await expect(sub).toBeVisible();
    await expect(sub).toHaveAttribute("href", `/category/${VISIBLE[0].slug}/${SUBCATEGORY.slug}`);
  });

  test("Hindi pages show Hindi names and /hi links from the first render", async ({ page }) => {
    await setup(page);
    await page.goto("/hi");
    await expect(page.locator(DESKTOP_NAV)).toBeVisible();
    await expect.poll(async () => (await navLinks(page)).slice(1, 5)).toEqual(VISIBLE.map((c) => c.nameHi || c.name));
    await expect(page.locator(DESKTOP_NAV).getByRole("link", { name: VISIBLE[0].nameHi, exact: true })).toHaveAttribute("href", `/hi/category/${VISIBLE[0].slug}`);
  });
});

test.describe("Mobile nav", () => {
  test.skip(({ viewport }) => !viewport || viewport.width >= 768, "mobile only");

  test("desktop nav stays hidden; the bottom bar's Categories tab is unchanged", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await expect(page.locator(DESKTOP_NAV)).toBeHidden();
    await expect(page.locator('nav[aria-label="Primary"]').getByRole("button", { name: "Categories" })).toBeVisible();
  });
});
