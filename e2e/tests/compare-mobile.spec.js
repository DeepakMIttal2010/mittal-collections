import { test, expect } from "@playwright/test";

test.describe("Compare", () => {
  test("adding products shows the floating compare bar with the right count, and clearing removes it", async ({
    page,
  }) => {
    await page.goto("/");

    const toggleButtons = page.getByRole("button", { name: "Toggle compare" });
    await expect(toggleButtons.first()).toBeVisible({ timeout: 10000 });

    await toggleButtons.nth(0).click();
    await toggleButtons.nth(1).click();

    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByRole("link", { name: /compare/i }).last().click();
    await expect(page).toHaveURL(/\/compare/);
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByRole("button", { name: "Clear compare list" }).click();
    await expect(page.getByText("2 selected")).toHaveCount(0);
  });
});

test.describe("Mobile viewport (≤375px)", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("compare bar does not overflow or overlap the WhatsApp button", async ({
    page,
  }) => {
    await page.goto("/");

    const toggleButtons = page.getByRole("button", { name: "Toggle compare" });
    await expect(toggleButtons.first()).toBeVisible({ timeout: 10000 });
    await toggleButtons.nth(0).click();
    await toggleButtons.nth(1).click();
    await toggleButtons.nth(2).click();
    await toggleButtons.nth(3).click();

    const compareBar = page.getByText("4 selected").locator("..");
    const whatsapp = page.getByRole("link", {
      name: /chat with us on whatsapp/i,
    });

    await expect(compareBar).toBeVisible();
    await expect(whatsapp).toBeVisible();

    const compareBarBox = await compareBar.boundingBox();
    const whatsappBox = await whatsapp.boundingBox();
    const viewportWidth = 375;

    // Compare bar must stay within the viewport width (max-w-[94vw] in
    // the component — this regression-guards the mobile overflow bug
    // found and fixed earlier).
    expect(compareBarBox.x).toBeGreaterThanOrEqual(0);
    expect(compareBarBox.x + compareBarBox.width).toBeLessThanOrEqual(
      viewportWidth + 1, // 1px rounding tolerance
    );

    // The two floating elements must not visually overlap.
    const overlaps =
      compareBarBox.x < whatsappBox.x + whatsappBox.width &&
      compareBarBox.x + compareBarBox.width > whatsappBox.x &&
      compareBarBox.y < whatsappBox.y + whatsappBox.height &&
      compareBarBox.y + compareBarBox.height > whatsappBox.y;
    expect(overlaps).toBe(false);
  });
});
