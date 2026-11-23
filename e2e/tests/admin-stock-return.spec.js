import { test, expect } from "@playwright/test";

// PR-7 (admin audit OP-01): cancelling a Shipped/Delivered order leaves its
// stock out until the admin records the parcel as received (restock) or
// lost (no restock). Admin Orders must say so before the cancel, flag the
// pending parcel, and offer the two actions.
//
// API fully mocked inside the browser: no request reaches a real server.
// The only non-GET calls answered are the two this page is meant to make
// (status change, stock-return) and they are answered by the mock here;
// every other non-GET is aborted.

const ADMIN = { _id: "admin-1", name: "E2E Admin", email: "e2e-admin@example.invalid", role: "admin" };

const baseOrder = (overrides) => ({
  user: { _id: "u1", name: "Asha Test", email: "asha@example.invalid" },
  orderItems: [{ product: "p1", name: "Test Bedsheet", image: "", price: 999, quantity: 1 }],
  shippingAddress: { fullName: "Asha Test", mobile: "9000000000", address: "1 Test St", city: "Ghaziabad", state: "Uttar Pradesh", pincode: "201001" },
  paymentMethod: "COD",
  isPaid: false,
  isActive: true,
  totalPrice: 999,
  createdAt: "2026-11-20T06:00:00.000Z",
  statusHistory: [],
  ...overrides,
});

async function mockApi(page, orders) {
  const calls = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isApi = url.pathname.startsWith("/api/") && url.port !== "5173";
    if (!isApi) {
      if (req.method() !== "GET") return route.abort();
      return route.continue();
    }

    const status = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (status && req.method() === "PUT") {
      const body = req.postDataJSON();
      calls.push({ kind: "status", id: status[1], body });
      const order = orders.find((o) => o._id === status[1]);
      Object.assign(order, {
        orderStatus: body.status,
        stockReturnPending: body.status === "Cancelled" && ["Shipped", "Delivered"].includes(order.orderStatus),
      });
      return route.fulfill({ json: { success: true, order } });
    }

    const stockReturn = url.pathname.match(/^\/api\/orders\/([^/]+)\/stock-return$/);
    if (stockReturn && req.method() === "PUT") {
      const body = req.postDataJSON();
      calls.push({ kind: "stock-return", id: stockReturn[1], body });
      const order = orders.find((o) => o._id === stockReturn[1]);
      Object.assign(order, { stockReturnPending: false, stockReturnOutcome: body.outcome });
      return route.fulfill({ json: { success: true, order } });
    }

    if (req.method() !== "GET") return route.abort();
    if (url.pathname === "/api/orders") return route.fulfill({ json: { success: true, orders } });
    return route.fulfill({ json: { success: true } });
  });
  return calls;
}

// The per-order status dropdown, not the "All Status" list filter above.
const orderStatusSelect = (page) => page.locator("select:not(:has(option[value=All]))").first();

const loginAsAdmin = (context) =>
  context.addInitScript((user) => {
    localStorage.setItem("adminToken", "e2e-mock-token");
    localStorage.setItem("adminUser", JSON.stringify(user));
  }, ADMIN);

test.describe("Admin Orders: parcel return after cancelling a shipped order", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test("S1 cancelling a Shipped order warns that stock waits for the parcel", async ({ page }) => {
    const orders = [baseOrder({ _id: "665f00000000000000aaa111", orderStatus: "Shipped" })];
    const calls = await mockApi(page, orders);
    await page.goto("/admin/orders");

    let message = "";
    page.once("dialog", async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    });
    await orderStatusSelect(page).selectOption("Cancelled");

    await expect.poll(() => calls.filter((c) => c.kind === "status").length).toBe(1);
    expect(message).toMatch(/parcel/i);
    expect(message).toMatch(/stock/i);
    expect(message).toMatch(/received/i);
  });

  test("S2 guard: cancelling a Processing order keeps the usual prompt", async ({ page }) => {
    const orders = [baseOrder({ _id: "665f00000000000000bbb222", orderStatus: "Processing" })];
    const calls = await mockApi(page, orders);
    await page.goto("/admin/orders");

    let message = "";
    page.once("dialog", async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    });
    await orderStatusSelect(page).selectOption("Cancelled");

    await expect.poll(() => calls.filter((c) => c.kind === "status").length).toBe(1);
    expect(message).toMatch(/Stock and any points\/coupon used will be reversed/);
    expect(message).not.toMatch(/parcel/i);
  });

  test("S3 a pending parcel is flagged and 'received' sends outcome=received", async ({ page }) => {
    const id = "665f00000000000000ccc333";
    const orders = [baseOrder({ _id: id, orderStatus: "Cancelled", stockReturnPending: true })];
    const calls = await mockApi(page, orders);
    await page.goto("/admin/orders");

    await expect(page.getByText(/Parcel return pending/i).first()).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /parcel received/i }).first().click();

    await expect.poll(() => calls.filter((c) => c.kind === "stock-return")).toEqual([
      { kind: "stock-return", id, body: { outcome: "received" } },
    ]);
    await expect(page.getByText(/Parcel return pending/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /parcel received/i })).toHaveCount(0);
  });

  test("S4 'lost' sends outcome=lost after a confirm", async ({ page }) => {
    const id = "665f00000000000000ddd444";
    const orders = [baseOrder({ _id: id, orderStatus: "Cancelled", stockReturnPending: true })];
    const calls = await mockApi(page, orders);
    await page.goto("/admin/orders");

    let message = "";
    page.once("dialog", async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    });
    await page.getByRole("button", { name: /parcel lost/i }).first().click();

    await expect.poll(() => calls.filter((c) => c.kind === "stock-return")).toEqual([
      { kind: "stock-return", id, body: { outcome: "lost" } },
    ]);
    expect(message).toMatch(/not.*(restock|stock)/i);
  });

  test("S5 a settled or never-pending cancelled order shows no parcel actions", async ({ page }) => {
    const orders = [
      baseOrder({ _id: "665f00000000000000eee555", orderStatus: "Cancelled", stockReturnPending: false, stockReturnOutcome: "received" }),
      baseOrder({ _id: "665f00000000000000fff666", orderStatus: "Cancelled" }),
    ];
    await mockApi(page, orders);
    await page.goto("/admin/orders");

    await expect(page.locator("span", { hasText: /^Cancelled$/ })).toHaveCount(2);
    await expect(page.getByText(/Parcel return pending/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /parcel (received|lost)/i })).toHaveCount(0);
  });
});
