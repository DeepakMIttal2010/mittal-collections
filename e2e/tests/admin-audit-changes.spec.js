import { test, expect } from "@playwright/test";

// PR-9b1: the Audit Log table shows what an update actually changed --
// "price: 999 -> 899" -- and keeps showing PR-9a entries (no `changes`)
// by their field names (D8). Long text shows only that it changed and
// its length (D3); images show counts, never URLs (D4).
//
// API fully mocked inside the browser: no request reaches a real server
// and every non-GET request is aborted.

const FULL_ADMIN = { _id: "admin-1", name: "E2E Owner", email: "e2e-owner@example.invalid", role: "admin", adminRole: null };

const BASE = {
  actor: { id: "admin-1", name: "E2E Owner", fullAdmin: true, roleName: null },
  method: "PUT",
  route: "/api/products/:id",
  path: "/api/products/665f000000000000000b0001",
  entity: "products",
  entityId: "665f000000000000000b0001",
  statusCode: 200,
  outcome: "success",
  fields: ["name", "description", "price", "stock", "images"],
  createdAt: "2026-11-27T06:30:00.000Z",
};

const WITH_CHANGES = {
  ...BASE,
  _id: "log-changes",
  changes: [
    { field: "price", from: 999, to: 899 },
    { field: "description", changed: true, fromLength: 820, toLength: 790 },
    { field: "images", fromCount: 1, toCount: 2, mainImageChanged: true },
  ],
};

const OLD_STYLE = {
  ...BASE,
  _id: "log-old",
  route: "/api/orders/:id/status",
  path: "/api/orders/665f000000000000000a0001/status",
  entity: "orders",
  entityId: "665f000000000000000a0001",
  fields: ["status", "confirmPaidCancellation"],
  createdAt: "2026-11-26T06:30:00.000Z",
};

async function mockApi(page, entries) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isApi = url.pathname.startsWith("/api/") && url.port !== "5173" && url.port !== "5174";
    if (req.method() !== "GET") return route.abort();
    if (!isApi) return route.continue();
    if (url.pathname === "/api/admin/audit-log") {
      return route.fulfill({
        json: { success: true, entries, page: 1, limit: 50, total: entries.length, totalPages: 1 },
      });
    }
    return route.fulfill({ json: { success: true } });
  });
}

const loginAs = (context, user) =>
  context.addInitScript((u) => {
    localStorage.setItem("adminToken", "e2e-mock-token");
    localStorage.setItem("adminUser", JSON.stringify(u));
  }, user);

test.describe("Admin Audit Log: recorded changes", () => {
  test("E5 an update shows old -> new values, 'changed' for long text and image counts", async ({ page, context }) => {
    await loginAs(context, FULL_ADMIN);
    await mockApi(page, [WITH_CHANGES]);
    await page.goto("/admin/audit-log");

    const row = page.getByRole("table").getByRole("row").filter({ hasText: "/api/products/:id" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/price/);
    await expect(row).toContainText(/999\s*→\s*899/);
    await expect(row).toContainText(/description/);
    await expect(row).toContainText(/changed/i);
    await expect(row).toContainText(/images/);
    await expect(row).toContainText(/1\s*→\s*2/);
  });

  test("E6 (guard) an entry without changes still lists its field names", async ({ page, context }) => {
    await loginAs(context, FULL_ADMIN);
    await mockApi(page, [OLD_STYLE]);
    await page.goto("/admin/audit-log");

    const row = page.getByRole("table").getByRole("row").filter({ hasText: "/api/orders/:id/status" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("status, confirmPaidCancellation");
  });
});
