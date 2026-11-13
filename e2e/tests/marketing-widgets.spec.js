import { test, expect } from "@playwright/test";

import {
  createOutOfStockProductPath,
  createTestUser,
  ensureSiteSettingsPhone,
  getSeededProductPath,
  loginAs,
} from "./helpers.js";

test.describe("Welcome popup", () => {
  // Guests only: opens after 25s on the site or at 50% scroll, whichever
  // comes first, then not again for 24 hours (utils/welcomePopupTrigger.js).
  const SHOWN_KEY = "mc_welcome_popup_shown_at";
  const HOUR = 60 * 60 * 1000;
  const heading = (page) =>
    page.getByRole("heading", { name: /welcome to mittal collections/i });

  // Fake clock, paused before the page loads: the 25s delay and the 5s
  // auto-close only move when a test calls clock.runFor, so a slow (cold)
  // page load can't fire them early or late.
  async function openWithPausedClock(page) {
    const start = new Date();
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  }

  async function scrollTo(page, fraction) {
    await page.evaluate(
      (f) =>
        window.scrollTo(
          0,
          Math.round((document.documentElement.scrollHeight - window.innerHeight) * f),
        ),
      fraction,
    );
  }

  // Stand-in for an earlier visit: "shown at" = now - agoMs.
  async function seedShownAgo(page, agoMs) {
    await page.addInitScript(
      ([key, ago]) => localStorage.setItem(key, String(Date.now() - ago)),
      [SHOWN_KEY, agoMs],
    );
  }

  test("appears for a guest after 25 seconds, and auto-closes", async ({
    page,
  }) => {
    await openWithPausedClock(page);
    const popup = heading(page);

    await page.clock.runFor(20000);
    await expect(popup).toBeHidden();

    await page.clock.runFor(6000);
    await expect(popup).toBeVisible();

    // Auto-closes ~5s after appearing. That's a chain of timers (enter
    // transition -> 5s auto-close -> 300ms exit), each one only scheduled
    // once React has rendered the previous step, so advance in small steps
    // rather than one big jump.
    await expect
      .poll(
        async () => {
          await page.clock.runFor(500);
          return popup.isVisible();
        },
        { timeout: 15000 },
      )
      .toBe(false);
  });

  test("appears for a guest at 50% scroll, before the delay", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const popup = heading(page);

    await scrollTo(page, 0.3);
    await page.waitForTimeout(1000);
    await expect(popup).toBeHidden();

    await scrollTo(page, 0.6);
    await expect(popup).toBeVisible({ timeout: 5000 });
  });

  test("does not appear again within 24 hours", async ({ page }) => {
    await seedShownAgo(page, 1 * HOUR);
    await openWithPausedClock(page);
    const popup = heading(page);

    await scrollTo(page, 0.6);
    await page.clock.runFor(30000);
    await expect(popup).toBeHidden();
  });

  test("appears again once 24 hours have passed", async ({ page }) => {
    await seedShownAgo(page, 25 * HOUR);
    await openWithPausedClock(page);

    await page.clock.runFor(26000);
    await expect(heading(page)).toBeVisible();
  });

  test("does not appear for a logged-in visitor", async ({
    page,
    context,
    request,
  }) => {
    const testUser = await createTestUser(request);
    await loginAs(context, testUser);

    await openWithPausedClock(page);

    // Past both triggers, to make sure it genuinely never appears, not
    // just that it's late.
    await scrollTo(page, 0.6);
    await page.clock.runFor(30000);
    await expect(heading(page)).not.toBeVisible();
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
