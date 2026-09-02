import { test, expect } from "@playwright/test";

import { createTestUser, loginAs } from "./helpers.js";

const OUT_OF_STOCK_PRODUCT_PATH =
  "/product/6a704911f58e74c67c50b590/bricks-design-cotton-doormat";
const IN_STOCK_PRODUCT_PATH =
  "/product/6a64556a561a6d5a63017fb2/luxury-cotton-bedsheet";

test.describe("Welcome popup", () => {
  test("appears for a guest after the delay, and auto-closes", async ({
    page,
  }) => {
    await page.goto("/");

    const popup = page.getByRole("heading", {
      name: /welcome to mittal collections/i,
    });

    // Shows after ~2.5s — generous timeout since this is the first
    // navigation in the file and can pay Vite's cold-compile cost.
    await expect(popup).toBeVisible({ timeout: 10000 });

    // Auto-closes after ~5s from appearing.
    await expect(popup).toBeHidden({ timeout: 12000 });
  });

  test("does not appear for a logged-in visitor", async ({
    page,
    context,
    request,
  }) => {
    const testUser = await createTestUser(request);
    await loginAs(context, testUser);

    await page.goto("/");

    const popup = page.getByRole("heading", {
      name: /welcome to mittal collections/i,
    });

    // Wait well past the guest-case delay to make sure it genuinely
    // never appears, not just that it's late.
    await page.waitForTimeout(4000);
    await expect(popup).not.toBeVisible();
  });
});

test.describe("WhatsApp buttons", () => {
  test("site-wide floating button links to a generic WhatsApp chat", async ({
    page,
  }) => {
    await page.goto("/");
    const button = page.getByRole("link", {
      name: /chat with us on whatsapp/i,
    });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  });

  test("product-page WhatsApp button is pre-filled and enabled for an in-stock product", async ({
    page,
  }) => {
    await page.goto(IN_STOCK_PRODUCT_PATH);
    const button = page.getByRole("link", { name: /order on whatsapp/i });
    await expect(button).toBeVisible();
    const href = await button.getAttribute("href");
    expect(href).toContain("wa.me");
    expect(decodeURIComponent(href)).toContain("Luxury Cotton Bedsheet");
  });

  test("product-page WhatsApp button is a disabled <button>, not a clickable link, for an out-of-stock product", async ({
    page,
  }) => {
    await page.goto(OUT_OF_STOCK_PRODUCT_PATH);
    const button = page.getByRole("button", { name: /order on whatsapp/i });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    // Confirm the in-stock variant (a real link) does NOT also render.
    await expect(
      page.getByRole("link", { name: /order on whatsapp/i }),
    ).toHaveCount(0);
  });
});
