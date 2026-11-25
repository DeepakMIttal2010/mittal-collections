import { test, expect } from "@playwright/test";

// Search results page (audit 2026-11-24, SR-03): shows how many products
// matched ("3 results" / "3 परिणाम"; "1 result" singular), and the
// zero-result page keeps its category chips. The search API is mocked: no
// request reaches a real server (the live search endpoint logs every
// query), and every non-GET is aborted.

const CATEGORIES = [
  { _id: "c1", name: "Bedsheets", nameHi: "बेडशीट", slug: "bedsheets", isActive: true },
  { _id: "c2", name: "Dohars", nameHi: "दोहर", slug: "dohars", isActive: true },
];
const product = (i) => ({
  _id: `p${i}`,
  name: `Test Dohar ${i}`,
  slug: `test-dohar-${i}`,
  price: 499,
  stock: 5,
  images: [],
  category: { _id: "c2", name: "Dohars", slug: "dohars" },
});
const RESULTS = { dohars: [product(1), product(2), product(3)], dohar: [product(1)], banarasi: [] };

async function mockApi(page) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/") || url.port === "5173") return route.continue();
    if (url.pathname === "/api/categories") return route.fulfill({ json: { success: true, categories: CATEGORIES } });
    if (url.pathname === "/api/products" && url.searchParams.has("search")) {
      return route.fulfill({ json: { success: true, products: RESULTS[url.searchParams.get("search")] ?? [] } });
    }
    return route.abort();
  });
}

test.describe("Search results count", () => {
  test("SR-E1 shows the number of results (EN, plural and singular)", async ({ page }) => {
    await mockApi(page);
    await page.goto("/search?q=dohars");
    await expect(page.getByTestId("search-count")).toHaveText("3 results");
    await page.goto("/search?q=dohar");
    await expect(page.getByTestId("search-count")).toHaveText("1 result");
  });

  test("SR-E2 Hindi count", async ({ page }) => {
    await mockApi(page);
    await page.addInitScript(() => localStorage.setItem("language", "hi"));
    await page.goto("/search?q=dohars");
    await expect(page.getByTestId("search-count")).toHaveText("3 परिणाम");
  });

  test("SR-E3 zero results: no count line, category chips kept", async ({ page }) => {
    await mockApi(page);
    await page.goto("/search?q=banarasi");
    await expect(page.getByText('No products found for "banarasi".')).toBeVisible();
    await expect(page.getByTestId("search-count")).toHaveCount(0);
    // The chips inside the zero-result block (the header also links categories).
    const zero = page.locator("div.text-center").filter({ hasText: 'No products found for "banarasi".' });
    await expect(zero.locator('a[href="/category/bedsheets"]')).toBeVisible();
    await expect(zero.locator('a[href="/category/dohars"]')).toBeVisible();
  });
});
