import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// Desktop "More" dropdown: a category link must open its page when a
// person moves the mouse down the list and clicks it. It didn't
// (2026-11-20): the panel first opens narrow (the first category has no
// subcategories), widens and slides left when a category with wide
// subcategory groups is hovered, and pressing the mouse on a link focused
// it -- that re-ran the dropdown's open(), which re-measured the trigger
// and put the panel back where it first opened. The link moved away
// between mousedown and mouseup, so the browser never fired a click.
//
// Uses the real mouse (move, down, up). locator.click() jumps straight to
// the link and never reproduced this.

const CATEGORIES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../client/src/data/navCategoriesSnapshot.json"), "utf8"),
);
const bySlug = (slug) => CATEGORIES.find((c) => c.slug === slug);

// Wide subcategory groups (like the live Doormats / Table Covers menus),
// so the panel has to widen and move left once they're hovered.
const wideGroups = (category) =>
  ["By Type", "By Material", "Size", "By Room"].flatMap((groupLabel, g) =>
    [1, 2, 3].map((n) => ({
      _id: `${category.slug}-${g}-${n}`,
      name: `${groupLabel} ${category.name} long option ${n}`,
      nameHi: `${groupLabel} ${n}`,
      slug: `${category.slug}-${g}-${n}`,
      groupLabel,
      category: { _id: category._id, slug: category.slug, name: category.name },
      isActive: true,
    })),
  );

const SUBCATEGORIES = ["doormats", "table-covers", "towels"].flatMap((slug) => wideGroups(bySlug(slug)));
const DESKTOP_NAV = "nav.hidden.md\\:block";

test.describe("desktop More menu", () => {
  test.skip(({ viewport }) => !viewport || viewport.width < 1024, "desktop navigation only");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/categories", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, categories: CATEGORIES }) }),
    );
    await page.route("**/api/subcategories", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, subcategories: SUBCATEGORIES }) }),
    );
  });

  // Where the category's link is in the open panel right now.
  const linkCenter = (page, name) =>
    page.evaluate((text) => {
      const a = [...document.querySelectorAll("a")].find(
        (el) => el.textContent.trim() === text && el.closest('div[style*="position: fixed"]'),
      );
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, name);

  for (const slug of ["table-covers", "towels", "hotel-linen"]) {
    test(`clicking ${slug} with the mouse opens its page`, async ({ page }) => {
      const category = bySlug(slug);
      await page.goto("/");
      const more = page.locator(DESKTOP_NAV).getByRole("button", { name: /^more$/i });
      await expect(more).toBeVisible();

      const box = await more.boundingBox();
      let cursor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(cursor.x, cursor.y);
      await expect.poll(() => linkCenter(page, category.name)).not.toBeNull();

      // Move down the list to the link, passing the wide categories; if
      // the panel slides, re-aim at the link the way a person would.
      for (let i = 0; i < 5; i++) {
        const target = await linkCenter(page, category.name);
        expect(target, "the More panel closed while moving to the link").not.toBeNull();
        if (Math.abs(target.x - cursor.x) < 2 && Math.abs(target.y - cursor.y) < 2) break;
        await page.mouse.move(target.x, target.y, { steps: 20 });
        cursor = target;
        await page.waitForTimeout(200);
      }

      await page.mouse.down();
      await page.mouse.up();
      await expect(page).toHaveURL(new RegExp(`/category/${slug}$`));
    });
  }
});
