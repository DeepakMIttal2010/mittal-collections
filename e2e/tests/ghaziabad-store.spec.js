import { test, expect } from "@playwright/test";

// Ghaziabad store page (audit 2026-11-23, GZ-02/03/05). The page must not
// promise "real photos" (about half the catalogue carries an AI/catalog
// image note) or "hassle-free returns" (54 of 204 products are not
// returnable); the returns bullet links the Returns Policy page; the
// walk-in note stays until the shop reopens. API fully mocked: no request
// reaches a real server, and every non-GET is aborted.

// The 13 live categories (2026-11-23) plus an inactive one and one without
// a slug -- neither may become a link (same rule as the bot render).
const LIVE = ["bedsheets", "comforters", "curtains", "cushion-covers", "cushions", "dohars", "doormats",
  "hotel-linen", "mattress-covers", "table-covers", "table-runners", "towels", "toys"];
const CATEGORIES = [
  ...LIVE.map((slug, i) => ({ _id: `c${i}`, name: slug.replace(/-/g, " "), nameHi: `श्रेणी ${i}`, slug, isActive: true })),
  { _id: "x1", name: "Old Range", nameHi: "पुरानी", slug: "old-range", isActive: false },
  { _id: "x2", name: "No Slug", nameHi: "बिना", slug: "", isActive: true },
];

async function mockApi(page, { phone = "+91-9999999999" } = {}) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/") || url.port === "5173") return route.continue();
    if (url.pathname === "/api/categories") return route.fulfill({ json: { success: true, categories: CATEGORIES } });
    if (url.pathname === "/api/settings") {
      return route.fulfill({ json: { success: true, settings: { phone } } });
    }
    return route.fulfill({ json: { success: true } });
  });
}

const main = (page) => page.locator("h1").locator("xpath=ancestor::div[contains(@class,'max-w-4xl')][1]");

test.describe("Ghaziabad store page", () => {
  test("GZ-E1 English: four bullets, no old claims, returns links the policy page, walk-in note", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ghaziabad-home-furnishing-store");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home Furnishing Store in Ghaziabad");
    const body = main(page);
    await expect(body.locator("ul li")).toHaveCount(4);
    await expect(body).not.toContainText(/real photos|hassle-free/i);
    const returns = body.getByRole("link", { name: "Returns Policy" });
    await expect(returns).toHaveAttribute("href", "/policies/returns");
    await expect(body).toContainText("Returns are available on eligible products.");
    await expect(body).toContainText("not accepting walk-ins");
    await expect(body).toContainText("Trusted by Ghaziabad families since 2021.");
    const catLinks = body.locator('a[href^="/category/"]');
    await expect(catLinks).toHaveCount(13);
    expect(await catLinks.evaluateAll((els) => els.map((a) => a.getAttribute("href")))).toEqual(
      LIVE.map((slug) => `/category/${slug}`),
    );
    await expect(body.locator('a[href="/contact"]')).toHaveCount(1);
  });

  test("GZ-E2 Hindi: Hindi returns text + link, no old claims", async ({ page }) => {
    await mockApi(page);
    await page.addInitScript(() => localStorage.setItem("language", "hi"));
    await page.goto("/ghaziabad-home-furnishing-store");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("गाजियाबाद में होम फर्निशिंग स्टोर");
    const body = main(page);
    await expect(body.locator("ul li")).toHaveCount(4);
    await expect(body).not.toContainText(/असली फोटो|झंझट/);
    await expect(body).toContainText("योग्य प्रोडक्ट्स पर रिटर्न उपलब्ध है।");
    await expect(body.getByRole("link", { name: "रिटर्न पॉलिसी" })).toHaveAttribute("href", "/policies/returns");
    await expect(body).toContainText("वॉक-इन");
  });

  test("GZ-E4 no phone in settings: no Call Us section, no tel: link", async ({ page }) => {
    await mockApi(page, { phone: "" });
    await page.goto("/ghaziabad-home-furnishing-store");
    const body = main(page);
    await expect(body).toContainText("Visit Us");
    await expect(body).not.toContainText("Call Us");
    await expect(body.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test("GZ-E3 no horizontal overflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ghaziabad-home-furnishing-store");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
