import { test, expect } from "@playwright/test";

// Curtain Size Calculator (audit 2026-11-22, CS-01/02/03/05/07, owner
// decisions D1-D7). We stock one panel width (4 ft) in two lengths --
// 7x4 ft and 9x4 ft, written length x width -- so the calculator must only
// ever recommend those, count panels instead of inventing wider sizes,
// warn instead of silently recommending a too-short curtain, and refuse
// invalid measurements. API fully mocked: no request leaves the browser
// for a real server, and every non-GET is aborted.

const CATEGORIES = [
  { _id: "cat-curtains", name: "Curtains", nameHi: "पर्दे", slug: "curtains", isActive: true },
];
const variants = (s7, s9) => [
  { size: "7x4", price: 404, oldPrice: 475, stock: s7 },
  { size: "9x4", price: 468, oldPrice: 550, stock: s9 },
];
const PRODUCTS = [
  { _id: "p1", name: "Curtain A", slug: "curtain-a", isActive: true, stock: 20, variants: variants(10, 10) },
  { _id: "p2", name: "Curtain B", slug: "curtain-b", isActive: true, stock: 2, variants: variants(1, 1) },
  { _id: "p3", name: "Curtain C", slug: "curtain-c", isActive: true, stock: 2, variants: variants(2, 0) },
];

async function mockApi(page, { productsFail = false } = {}) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/") || url.port === "5173") return route.continue();
    if (url.pathname === "/api/categories") {
      return route.fulfill({ json: { success: true, categories: CATEGORIES } });
    }
    if (url.pathname === "/api/products" && url.searchParams.get("category") === "cat-curtains") {
      if (productsFail) return route.fulfill({ status: 500, json: { success: false } });
      return route.fulfill({ json: { success: true, products: PRODUCTS } });
    }
    return route.fulfill({ json: { success: true } });
  });
}

const result = (page) => page.getByTestId("calc-result");
const width = (page) => page.getByLabel(/Window Width/);
const drop = (page) => page.getByLabel(/Rod to floor/);

test.describe("Curtain Size Calculator", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/curtain-size-calculator");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("E1 default shows 7×4 ft × 2 panels, never a 5 ft size", async ({ page }) => {
    await expect(result(page)).toContainText("7×4 ft");
    await expect(page.getByTestId("calc-panels")).toContainText("2");
    await expect(page.locator("body")).not.toContainText("5 ft × 7 ft");
  });

  test("E2 touching floor is never shorter than just above floor", async ({ page }) => {
    const finalLength = async () =>
      Number((await page.getByTestId("calc-final-length").innerText()).match(/\d+/)[0]);
    await page.getByText("Just above floor", { exact: true }).click();
    const above = await finalLength();
    await page.getByText("Touching floor", { exact: true }).click();
    const touching = await finalLength();
    await page.getByText("Puddle on floor", { exact: true }).click();
    const puddle = await finalLength();
    expect(above).toBeLessThan(touching);
    expect(touching).toBeLessThan(puddle);
  });

  test("E3 a 120 inch window needs 4 panels, not a bigger size", async ({ page }) => {
    await width(page).fill("120");
    await expect(page.getByTestId("calc-panels")).toContainText("4");
    await expect(result(page)).not.toContainText("7 ft ×");
  });

  test("E4 a 111 inch drop warns that nothing fits and hides Shop", async ({ page }) => {
    await page.getByText("Touching floor", { exact: true }).click();
    await drop(page).fill("111");
    await expect(page.getByTestId("calc-no-fit")).toContainText("3");
    await expect(page.getByTestId("calc-shop")).toHaveCount(0);
    await expect(page.getByTestId("calc-tip")).toContainText("above the window/door frame");
  });

  test("E5 empty, zero and negative measurements show an error, no result", async ({ page }) => {
    for (const v of ["", "0", "-20"]) {
      await width(page).fill(v);
      await expect(page.getByTestId("calc-error")).toBeVisible();
      await expect(page.getByTestId("calc-shop")).toHaveCount(0);
      await expect(page.getByTestId("calc-size")).toHaveCount(0);
    }
  });

  test("E6 Shop links the matching size subcategory", async ({ page }) => {
    await expect(page.getByTestId("calc-shop")).toHaveAttribute("href", "/category/curtains/7x4-ft");
    await page.getByText("Touching floor", { exact: true }).click();
    await drop(page).fill("100");
    await expect(page.getByTestId("calc-shop")).toHaveAttribute("href", "/category/curtains/9x4-ft");
  });

  test("E7 live stock counts designs with enough panels", async ({ page }) => {
    // 7x4 x 2 panels: A (10) + C (2) = 2 designs; B has only 1
    await expect(page.getByTestId("calc-stock")).toContainText("2");
    await page.getByText("Touching floor", { exact: true }).click();
    await drop(page).fill("100"); // 9x4 x 2 panels: only A
    await expect(page.getByTestId("calc-stock")).toContainText("1");
  });

  test("E9 size chart lists only the two stocked sizes", async ({ page }) => {
    const rows = page.getByTestId("calc-size-chart").locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("7×4 ft");
    await expect(rows.nth(1)).toContainText("9×4 ft");
  });

  test("E10 no horizontal overflow", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test("E7b stock API failure hides the stock line but the calculation still works", async ({ page }) => {
  await mockApi(page, { productsFail: true });
  await page.goto("/curtain-size-calculator");
  await expect(result(page)).toContainText("7×4 ft");
  await expect(page.getByTestId("calc-stock")).toHaveCount(0);
});

test("E8 Hindi toggle shows Hindi messages", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => localStorage.setItem("language", "hi"));
  await page.goto("/curtain-size-calculator");
  await expect(result(page)).toContainText("7×4 फीट");
  await page.getByLabel(/विंडो की चौड़ाई/).fill("-5");
  await expect(page.getByTestId("calc-error")).toContainText(/[ऀ-ॿ]/);
});
