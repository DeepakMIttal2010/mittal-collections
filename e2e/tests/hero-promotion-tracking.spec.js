import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// Homepage hero banner tracking: view_promotion / select_promotion.
// gtag isn't loaded on localhost (index.html skips it), so a stub records
// what utils/analytics.js sends. /api/banners answers with the build
// snapshot so the banner ids are known and match the first render.

const BANNERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../client/src/data/heroBannersSnapshot.json"), "utf8"),
);
const nameOf = (b) => (b.title || b.subtitle).replace(/\s+/g, " ").trim();

async function setup(page) {
  await page.addInitScript(() => {
    window.__ga = [];
    window.gtag = (...args) => {
      if (args[0] === "event") window.__ga.push({ name: args[1], params: args[2] });
    };
  });
  await page.route("**/api/banners", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, banners: BANNERS }) }),
  );
}
// Fake clock, paused before the page loads: the 6s autoplay only moves
// when a test calls clock.runFor, so a slow (cold) page load can't add
// extra slides.
async function open(page) {
  const start = new Date();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await page.goto("/");
}
const events = (page, name) => page.evaluate((n) => window.__ga.filter((e) => e.name === n).map((e) => e.params), name);
const slots = async (page) => (await events(page, "view_promotion")).map((p) => p.creative_slot);

test.describe("Homepage hero banner tracking", () => {
  test.skip(BANNERS.length < 3, "needs at least 3 banners in the snapshot");

  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test("the first slide's view is sent once, with the banner's own id, name, slot and device", async ({ page }) => {
    await open(page);
    await expect(page.locator(".hero .hero-split-image")).toBeVisible();
    await expect.poll(() => slots(page)).toEqual(["homepage_hero_1"]);
    const [view] = await events(page, "view_promotion");
    const width = page.viewportSize().width;
    expect(view).toEqual({
      promotion_id: BANNERS[0]._id,
      promotion_name: nameOf(BANNERS[0]),
      creative_slot: "homepage_hero_1",
      device: width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop",
      items: [
        {
          item_id: BANNERS[0]._id,
          item_name: nameOf(BANNERS[0]),
          promotion_id: BANNERS[0]._id,
          promotion_name: nameOf(BANNERS[0]),
          creative_slot: "homepage_hero_1",
        },
      ],
    });
  });

  test("autoplay and dot/arrow navigation send each newly shown banner once, and no clicks", async ({ page }) => {
    await open(page);
    await expect.poll(() => slots(page)).toEqual(["homepage_hero_1"]);

    await page.clock.runFor(6100); // autoplay -> slide 2
    await expect.poll(() => slots(page)).toEqual(["homepage_hero_1", "homepage_hero_2"]);

    await page.locator(".hero-dot").nth(2).click(); // manual -> slide 3
    await page.locator(".hero-dot").nth(0).click(); // back to an already seen slide
    await page.locator(".hero-arrow-right").click(); // -> slide 2, seen
    await expect.poll(() => slots(page)).toEqual(["homepage_hero_1", "homepage_hero_2", "homepage_hero_3"]);

    const ids = (await events(page, "view_promotion")).map((p) => p.promotion_id);
    expect(ids).toEqual(BANNERS.slice(0, 3).map((b) => b._id));
    expect(await events(page, "select_promotion")).toEqual([]);
  });

  test("slides that rotate while the hero is scrolled away are not counted", async ({ page }) => {
    await open(page);
    await expect.poll(() => slots(page)).toEqual(["homepage_hero_1"]);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.clock.runFor(6100 * 2); // slides 2 and 3 rotate unseen
    expect(await slots(page)).toEqual(["homepage_hero_1"]);

    await page.evaluate(() => window.scrollTo(0, 0)); // back: slide 3 is showing
    await expect.poll(() => slots(page)).toEqual(["homepage_hero_1", "homepage_hero_3"]);
  });

  test("a CTA click sends one select_promotion for the shown banner and still navigates", async ({ page }) => {
    await open(page);
    await expect.poll(() => slots(page)).toEqual(["homepage_hero_1"]);
    await page.locator(".hero-dot").nth(1).click();

    const cta = page.locator(".hero-split-buttons .shop-btn");
    const href = await cta.getAttribute("href");
    await cta.click();
    await expect(page).toHaveURL((url) => url.pathname === new URL(href, "http://x").pathname);

    const clicks = await events(page, "select_promotion");
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({ promotion_id: BANNERS[1]._id, promotion_name: nameOf(BANNERS[1]), creative_slot: "homepage_hero_2" });
  });
});
