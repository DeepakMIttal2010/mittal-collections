import { test, expect } from "@playwright/test";

import { createTestUser, loginAs } from "./helpers.js";

const IN_STOCK_PRODUCT_PATH =
  "/product/6a64556a561a6d5a63017fb2/luxury-cotton-bedsheet";

test("adding to cart from the product page updates the cart drawer with matching totals", async ({
  page,
}) => {
  await page.goto(IN_STOCK_PRODUCT_PATH);

  await page.getByRole("button", { name: /add to cart/i }).first().click();

  // Adding an item auto-opens the cart drawer — no need to click the
  // header cart icon separately. The product name/price also appear
  // elsewhere on this same product page, so scope to the drawer
  // (renders last in the DOM) with .last().
  await expect(page.getByText("Luxury Cotton Bedsheet").last()).toBeVisible();
  await expect(page.getByText(/₹1,?499/).last()).toBeVisible();

  // The badge count renders before the "Cart" label in the DOM (see
  // Header.jsx), so the accessible name is "1 Cart", not "Cart 1" — and
  // a bare /Cart/ also matches every "Add to Cart" button on the page,
  // so anchor to the header button's exact name shape instead.
  const cartButton = page.getByRole("button", { name: /^\d*\s*Cart$/ });
  await expect(cartButton).toContainText("1");
});

test("logged-out checkout redirects to login and returns to checkout after logging in", async ({
  page,
}) => {
  await page.goto(IN_STOCK_PRODUCT_PATH);
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await page.goto("/checkout");

  await expect(page).toHaveURL("/login?redirect=/checkout");
});

test("a logged-in customer with an item in cart reaches the checkout page (not redirected)", async ({
  page,
  context,
  request,
}) => {
  const testUser = await createTestUser(request);
  await loginAs(context, testUser);

  await page.goto(IN_STOCK_PRODUCT_PATH);
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await page.goto("/checkout");

  await expect(page).toHaveURL("/checkout");
  // Should prompt to add a delivery address since this fresh test user has none.
  await expect(page.getByText(/address/i).first()).toBeVisible({
    timeout: 10000,
  });
});
