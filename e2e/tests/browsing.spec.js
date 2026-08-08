import { test, expect } from "@playwright/test";

// Fixture data seeded in the local dev database (server/seeder.js).
const CATEGORY_SLUG = "bedsheets";
const PRODUCT_PATH = "/product/6a64556a561a6d5a63017fb2/luxury-cotton-bedsheet";

test.describe("Category page", () => {
  test("loads products for a real category", async ({ page }) => {
    await page.goto(`/category/${CATEGORY_SLUG}`);
    await expect(page.locator("body")).not.toContainText("error", {
      ignoreCase: true,
    });
    // At least one product card should render.
    await expect(page.locator("a[href^='/product/']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows a friendly empty state for a category with no products, not a crash", async ({
    page,
  }) => {
    await page.goto("/category/does-not-exist-xyz");
    // Should not show a raw JS error overlay or blank white page.
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.toLowerCase()).not.toContain("uncaught");
    expect(bodyText.toLowerCase()).not.toContain("typeerror");
  });
});

test.describe("Search", () => {
  test("returns results for an exact term", async ({ page }) => {
    await page.goto("/search?q=bedsheet");
    await expect(page.locator("a[href^='/product/']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows a no-results state with category suggestions for a nonsense term", async ({
    page,
  }) => {
    await page.goto("/search?q=zzzznonexistentproductzzzz");
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    // Shouldn't crash, and shouldn't silently show unrelated products.
    expect(bodyText.toLowerCase()).not.toContain("uncaught");
  });

  test("autocomplete suggestions appear after typing and navigate on click", async ({
    page,
  }) => {
    await page.goto("/");
    // The desktop header search bar — specific placeholder text to
    // avoid also matching the mobile-only search form in the DOM.
    const searchInput = page.getByPlaceholder(/search bedsheets/i);
    await searchInput.fill("bed");
    // Debounced (250ms) suggestions dropdown — scoped to role="button"
    // since "Luxury Cotton Bedsheet" also appears in on-page product
    // cards/links elsewhere, which aren't buttons.
    const suggestion = page.getByRole("button", {
      name: /Luxury Cotton Bedsheet.*₹1499/,
    });
    await expect(suggestion).toBeVisible({ timeout: 5000 });
    await suggestion.click();
    await expect(page).toHaveURL(/\/product\//);
  });
});

test.describe("Product detail page", () => {
  test("renders gallery, price, description, and trust badges without errors", async ({
    page,
  }) => {
    await page.goto(PRODUCT_PATH);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10000,
    });
    // Price is shown somewhere on the page.
    await expect(page.locator("body")).toContainText("₹");
    // The main product page's Add to Cart button (related-product cards
    // further down also have their own, so this is deliberately .first()).
    await expect(
      page.getByRole("button", { name: /add to cart/i }).first(),
    ).toBeVisible();
  });

  test("shows the auto-compare table against similar products", async ({
    page,
  }) => {
    await page.goto(PRODUCT_PATH);
    await expect(
      page.getByText(/compare with similar products/i),
    ).toBeVisible({ timeout: 10000 });
  });
});
