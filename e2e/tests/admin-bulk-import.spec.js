import { test, expect } from "@playwright/test";
import path from "node:path";

// BI-01: Bulk Import must never create the same product twice.
// Owner decisions (2026-11-28): D1 client-only fix (Fix A); D2 a row whose
// request failed at the network level (the server may have created it) is
// "unknown" and is retried only after the admin ticks "Retry anyway";
// D3 once everything is imported the button is disabled and reads "All
// imported"; D5 imported rows are fully locked.
//
// Everything is mocked inside the browser: product creation
// (POST /api/products) is answered by the mock below and never reaches a
// server; every other non-GET request is aborted.

// Specs are compiled to CommonJS here, so __dirname is available.
const FIXTURES = path.join(__dirname, "fixtures", "bulk-import");
const IMAGES_DIR = path.join(FIXTURES, "images");
const CSV_THREE = path.join(FIXTURES, "products.csv");
const CSV_TWO = path.join(FIXTURES, "products-two.csv");

const FULL_ADMIN = { _id: "admin-1", name: "E2E Owner", email: "e2e-owner@example.invalid", role: "admin", adminRole: null };
const CATEGORIES = [{ _id: "cat-doormats", name: "Doormats", slug: "doormats" }];

// Imports run row by row; allow for a slow (cold) dev server.
const IMPORT_WAIT = 15000;

const DEV_PORTS = new Set(["5173", "5174", "5175"]);

// respond(name, attempt) -> "ok" | "reject" | "network"
async function mockApi(page, respond = () => "ok") {
  const posts = [];
  const attempts = {};
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isApi = url.pathname.startsWith("/api/") && !DEV_PORTS.has(url.port);
    if (isApi && req.method() === "POST" && url.pathname === "/api/products") {
      const body = req.postDataBuffer()?.toString("latin1") || "";
      const name = /name="name"\r\n\r\n([^\r]*)/.exec(body)?.[1] || "";
      attempts[name] = (attempts[name] || 0) + 1;
      posts.push(name);
      const outcome = respond(name, attempts[name]);
      if (outcome === "network") return route.abort("failed");
      if (outcome === "reject") {
        return route.fulfill({ status: 400, json: { success: false, message: "Price looks wrong" } });
      }
      return route.fulfill({ status: 201, json: { success: true, product: { _id: `p-${posts.length}`, name } } });
    }
    if (req.method() !== "GET") return route.abort();
    if (!isApi) return route.continue();
    if (url.pathname === "/api/categories") return route.fulfill({ json: { success: true, categories: CATEGORIES } });
    if (url.pathname === "/api/subcategories") return route.fulfill({ json: { success: true, subcategories: [] } });
    return route.fulfill({ json: { success: true } });
  });
  return posts;
}

const loginAs = (context, user) =>
  context.addInitScript((u) => {
    localStorage.setItem("adminToken", "e2e-mock-token");
    localStorage.setItem("adminUser", JSON.stringify(u));
  }, user);

async function openWithRows(page, context, csv) {
  await loginAs(context, FULL_ADMIN);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/admin/products/bulk-import");
  // Folder first, then CSV (the documented order).
  await page.locator("#bulkImportFolder").setInputFiles(IMAGES_DIR);
  await page.locator("#bulkImportCsv").setInputFiles(csv);
  await expect(page.getByRole("table")).toBeVisible();
}

const importButton = (page) => page.getByRole("button", { name: /import & publish|all imported|importing/i });
const rowOf = (page, name) => page.getByRole("row").filter({ has: page.locator(`input[value="${name}"]`) });

test.describe("Bulk Import: no duplicate products (BI-01)", () => {
  test("B1 after both rows are imported, the button is disabled and a second click posts nothing", async ({ page, context }) => {
    const posts = await mockApi(page);
    await openWithRows(page, context, CSV_TWO);

    await importButton(page).click();
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(2, { timeout: IMPORT_WAIT });
    expect(posts).toHaveLength(2);

    await expect(importButton(page)).toBeDisabled();
    await expect(importButton(page)).toHaveText(/all imported/i);
    await importButton(page).click({ force: true });
    await page.waitForTimeout(800);
    expect(posts).toHaveLength(2);
  });

  test("B2 a row the server refused (400) is the only one sent again", async ({ page, context }) => {
    const posts = await mockApi(page, (name, attempt) => (name === "E2E Bulk Mat B" && attempt === 1 ? "reject" : "ok"));
    await openWithRows(page, context, CSV_THREE);

    await importButton(page).click();
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(2, { timeout: IMPORT_WAIT });
    await expect(rowOf(page, "E2E Bulk Mat B")).toContainText("Price looks wrong");
    expect(posts).toHaveLength(3);

    await expect(importButton(page)).toHaveText(/\(1\)/);
    await importButton(page).click();
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(3, { timeout: IMPORT_WAIT });
    expect(posts).toEqual(["E2E Bulk Mat A", "E2E Bulk Mat B", "E2E Bulk Mat C", "E2E Bulk Mat B"]);
  });

  test("B3 a row lost to a network error is 'unknown' and only retried after 'Retry anyway' (D2)", async ({ page, context }) => {
    const posts = await mockApi(page, (name, attempt) => (name === "E2E Bulk Mat B" && attempt === 1 ? "network" : "ok"));
    await openWithRows(page, context, CSV_THREE);

    await importButton(page).click();
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(2, { timeout: IMPORT_WAIT });
    const rowB = rowOf(page, "E2E Bulk Mat B");
    await expect(rowB).toContainText(/check the products list/i);
    expect(posts).toHaveLength(3);

    await expect(importButton(page)).toBeDisabled();
    await rowB.getByLabel(/retry anyway/i).check();
    await expect(importButton(page)).toBeEnabled();
    await expect(importButton(page)).toHaveText(/\(1\)/);
    await importButton(page).click();
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(3, { timeout: IMPORT_WAIT });
    expect(posts).toEqual(["E2E Bulk Mat A", "E2E Bulk Mat B", "E2E Bulk Mat C", "E2E Bulk Mat B"]);
  });

  test("B4 two clicks in a row start only one import batch", async ({ page, context }) => {
    const posts = await mockApi(page);
    await openWithRows(page, context, CSV_TWO);

    // Both clicks land in the same task, before React can re-render the
    // button as disabled -- the guard must not rely on that re-render.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) => /import & publish/i.test(b.textContent));
      button.click();
      button.click();
    });
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(2, { timeout: IMPORT_WAIT });
    await page.waitForTimeout(800);
    expect(posts).toEqual(["E2E Bulk Mat A", "E2E Bulk Mat B"]);
  });

  test("B5 an imported row is locked: its fields can't be edited (D5)", async ({ page, context }) => {
    await mockApi(page);
    await openWithRows(page, context, CSV_TWO);

    await importButton(page).click();
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(2, { timeout: IMPORT_WAIT });

    const rowA = rowOf(page, "E2E Bulk Mat A");
    await expect(rowA.locator('input[type="text"]')).toBeDisabled();
    for (const input of await rowA.locator('input[type="number"]').all()) await expect(input).toBeDisabled();
    for (const select of await rowA.locator("select").all()) await expect(select).toBeDisabled();
    await expect(rowA.locator("textarea")).toBeDisabled();
  });

  test("B6 (guard) a normal first import sends each ready row once with its details", async ({ page, context }) => {
    const posts = await mockApi(page);
    await openWithRows(page, context, CSV_TWO);

    await expect(importButton(page)).toHaveText(/import & publish \(2\)/i);
    await importButton(page).click();
    await expect(page.getByText("Imported", { exact: true })).toHaveCount(2, { timeout: IMPORT_WAIT });
    expect(posts).toEqual(["E2E Bulk Mat A", "E2E Bulk Mat B"]);
  });
});
