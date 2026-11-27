import { test, expect } from "@playwright/test";

// PR-9a (AM-03): the admin Audit Log page -- a read-only table of admin
// write actions with filters and pagination, for Full Admin only (D4/D5).
// Restricted staff get neither the sidebar item nor the page, even by
// typing the URL (the client's generic permission guard lets unmapped
// paths through, so the page must enforce this itself; the server
// enforces it again).
//
// API fully mocked inside the browser: no request reaches a real server
// and every non-GET request is aborted.

const FULL_ADMIN = { _id: "admin-1", name: "E2E Owner", email: "e2e-owner@example.invalid", role: "admin", adminRole: null };
const RESTRICTED = {
  _id: "staff-1",
  name: "E2E Staff",
  email: "e2e-staff@example.invalid",
  role: "admin",
  // Every permission the app knows of -- still not Full Admin.
  adminRole: {
    _id: "role-1",
    name: "Everything Staff",
    permissions: ["dashboard", "orders", "products", "customers", "staff-users", "roles", "settings", "reports", "accounts"],
    writeAccess: [],
  },
};

const ENTRY = {
  _id: "log-1",
  actor: { id: "admin-1", name: "E2E Owner", fullAdmin: true, roleName: null },
  method: "PUT",
  route: "/api/orders/:id/status",
  path: "/api/orders/665f000000000000000a0001/status",
  entity: "orders",
  entityId: "665f000000000000000a0001",
  statusCode: 403,
  outcome: "failed",
  fields: ["status"],
  createdAt: "2026-11-26T06:30:00.000Z",
};

async function mockApi(page, { auditRequests } = {}) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isApi = url.pathname.startsWith("/api/") && url.port !== "5173" && url.port !== "5174";
    if (req.method() !== "GET") return route.abort();
    if (!isApi) return route.continue();
    if (url.pathname === "/api/admin/audit-log") {
      auditRequests?.push(url);
      const pageNo = Number(url.searchParams.get("page") || 1);
      return route.fulfill({
        json: { success: true, entries: [{ ...ENTRY, _id: `log-${pageNo}` }], page: pageNo, limit: 50, total: 60, totalPages: 2 },
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

test.describe("Admin Audit Log page", () => {
  test("E1 Full Admin sees the sidebar item and a table of entries", async ({ page, context }) => {
    await loginAs(context, FULL_ADMIN);
    await mockApi(page);
    await page.goto("/admin/audit-log");

    await expect(page.getByRole("link", { name: /audit log/i }).first()).toBeVisible();
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    for (const header of [/time/i, /admin/i, /action/i, /record/i, /result/i, /fields/i]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    const row = table.getByRole("row").filter({ hasText: "E2E Owner" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("PUT");
    await expect(row).toContainText("/api/orders/:id/status");
    await expect(row).toContainText("665f000000000000000a0001");
    await expect(row).toContainText("403");
    await expect(row).toContainText("status");
  });

  test("E2 filters and the next page are sent to the API", async ({ page, context }) => {
    const auditRequests = [];
    await loginAs(context, FULL_ADMIN);
    await mockApi(page, { auditRequests });
    await page.goto("/admin/audit-log");
    await expect(page.getByRole("table")).toBeVisible();

    await page.getByLabel(/record type/i).fill("orders");
    await page.getByLabel(/record id/i).fill("665f000000000000000a0001");
    await page.getByLabel(/^from/i).fill("2026-11-01");
    await page.getByRole("button", { name: /apply|filter|search/i }).click();

    await expect
      .poll(() => auditRequests.some((u) => u.searchParams.get("entity") === "orders"
        && u.searchParams.get("entityId") === "665f000000000000000a0001"
        && (u.searchParams.get("from") || "").startsWith("2026-11-01")))
      .toBe(true);

    await page.getByRole("button", { name: /next/i }).click();
    await expect
      .poll(() => auditRequests.some((u) => u.searchParams.get("page") === "2" && u.searchParams.get("entity") === "orders"))
      .toBe(true);
  });

  test("E3 the page is read-only: no edit or delete controls", async ({ page, context }) => {
    await loginAs(context, FULL_ADMIN);
    await mockApi(page);
    await page.goto("/admin/audit-log");
    await expect(page.getByRole("table")).toBeVisible();

    const main = page.locator("main");
    await expect(main.getByRole("button", { name: /edit|delete|remove|clear|purge/i })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /edit|delete|remove/i })).toHaveCount(0);
    await expect(page.getByRole("table").getByRole("checkbox")).toHaveCount(0);
  });

  test("E4 restricted staff get no sidebar item and the URL shows access restricted", async ({ page, context }) => {
    const auditRequests = [];
    await loginAs(context, RESTRICTED);
    await mockApi(page, { auditRequests });
    await page.goto("/admin/audit-log");

    await expect(page.getByText(/access restricted|don.t have access/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /audit log/i })).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    expect(auditRequests).toHaveLength(0);
  });
});
