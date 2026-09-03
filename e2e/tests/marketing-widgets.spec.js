import { test, expect } from "@playwright/test";

import {
  createOutOfStockProductPath,
  createTestUser,
  ensureSiteSettingsPhone,
  getSeededProductPath,
  loginAs,
} from "./helpers.js";

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
  // Every button in this block renders nothing at all without a phone
  // number configured (SiteSettings.phone) — nothing seeds one, so a
  // freshly seeded/never-configured site legitimately shows none of
  // them (see ensureSiteSettingsPhone's comment).
  test.beforeAll(async () => {
    await ensureSiteSettingsPhone();
  });

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
    const { path } = await getSeededProductPath();
    await page.goto(path);
    const button = page.getByRole("link", { name: /order on whatsapp/i });
    await expect(button).toBeVisible();
    const href = await button.getAttribute("href");
    expect(href).toContain("wa.me");
    expect(decodeURIComponent(href)).toContain("Luxury Cotton Bedsheet");
  });

  test("product-page WhatsApp button is a disabled <button>, not a clickable link, for an out-of-stock product", async ({
    page,
  }) => {
    const outOfStockPath = await createOutOfStockProductPath();
    await page.goto(outOfStockPath);
    const button = page.getByRole("button", { name: /order on whatsapp/i });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    // Confirm the in-stock variant (a real link) does NOT also render.
    await expect(
      page.getByRole("link", { name: /order on whatsapp/i }),
    ).toHaveCount(0);
  });
});
