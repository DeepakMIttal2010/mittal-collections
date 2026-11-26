import { test, expect } from "@playwright/test";

// D3-5: on Admin Orders, an online (Razorpay) order whose payment is not
// captured cannot be moved into fulfilment from the status dropdown --
// Processing, Shipped and Delivered are disabled with an explanation. An
// order already Shipped can still be marked Delivered. COD and paid orders
// keep every option. (The server refuses these moves anyway; this is the
// early warning.)
//
// API fully mocked inside the browser: no request reaches a real server and
// every non-GET request is aborted.

const ADMIN = { _id: "admin-1", name: "E2E Admin", email: "e2e-admin@example.invalid", role: "admin" };
const LOCK_TEXT = /online payment not received/i;

const order = (id, overrides) => ({
  _id: id,
  user: { _id: "u1", name: "Asha Test", email: "asha@example.invalid" },
  orderItems: [{ product: "p1", name: "Test Bedsheet", image: "", price: 999, quantity: 1 }],
  shippingAddress: { fullName: "Asha Test", mobile: "9000000000", address: "1 Test St", city: "Ghaziabad", state: "Uttar Pradesh", pincode: "201001" },
  isActive: true,
  totalPrice: 999,
  createdAt: "2026-11-20T06:00:00.000Z",
  statusHistory: [],
  ...overrides,
});

async function mockApi(page, orders) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isApi = url.pathname.startsWith("/api/") && url.port !== "5173" && url.port !== "5174";
    if (req.method() !== "GET") return route.abort();
    if (!isApi) return route.continue();
    if (url.pathname === "/api/orders") return route.fulfill({ json: { success: true, orders } });
    return route.fulfill({ json: { success: true } });
  });
}

const loginAsAdmin = (context) =>
  context.addInitScript((user) => {
    localStorage.setItem("adminToken", "e2e-mock-token");
    localStorage.setItem("adminUser", JSON.stringify(user));
  }, ADMIN);

// The status dropdown of one order row (not the "All Status" list filter):
// the innermost element holding both this order's id and a dropdown --
// nested matches come in document order, outermost first.
const statusSelectOf = (page, id) =>
  page
    .locator("div")
    .filter({ hasText: `#${id}` })
    .filter({ has: page.locator("select:not(:has(option[value=All]))") })
    .last()
    .locator("select:not(:has(option[value=All]))");

test.describe("Admin Orders: payment lock on unpaid online orders", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test("P1 unpaid Razorpay order: Processing, Shipped, Delivered disabled with the reason", async ({ page }) => {
    const id = "665f000000000000000d3a01";
    await mockApi(page, [order(id, { paymentMethod: "Razorpay", isPaid: false, orderStatus: "Pending" })]);
    await page.goto("/admin/orders");

    const select = statusSelectOf(page, id);
    await expect(select).toBeVisible();
    for (const status of ["Processing", "Shipped", "Delivered"]) {
      const option = select.locator(`option[value="${status}"]`);
      await expect(option, status).toBeDisabled();
      await expect(option, status).toHaveAttribute("title", LOCK_TEXT);
    }
    await expect(select.locator('option[value="Cancelled"]')).toBeEnabled();
  });

  test("P2 authorized-but-not-captured payment is locked the same way", async ({ page }) => {
    const id = "665f000000000000000d3a02";
    await mockApi(page, [
      order(id, { paymentMethod: "Razorpay", isPaid: false, orderStatus: "Pending", paymentReviewNeeded: true, paymentReviewReason: "authorized_uncaptured" }),
    ]);
    await page.goto("/admin/orders");

    const select = statusSelectOf(page, id);
    await expect(select.locator('option[value="Shipped"]')).toBeDisabled();
    await expect(select.locator('option[value="Shipped"]')).toHaveAttribute("title", LOCK_TEXT);
  });

  test("P3 guard: paid Razorpay and COD orders keep every option", async ({ page }) => {
    const paid = "665f000000000000000d3a03";
    const cod = "665f000000000000000d3a04";
    await mockApi(page, [
      order(paid, { paymentMethod: "Razorpay", isPaid: true, orderStatus: "Pending" }),
      order(cod, { paymentMethod: "COD", isPaid: false, orderStatus: "Pending" }),
    ]);
    await page.goto("/admin/orders");

    for (const id of [paid, cod]) {
      const select = statusSelectOf(page, id);
      await expect(select).toBeVisible();
      for (const status of ["Processing", "Shipped", "Delivered"]) {
        await expect(select.locator(`option[value="${status}"]`), `${id} ${status}`).toBeEnabled();
      }
    }
  });

  test("P4 guard: an unpaid Razorpay order already Shipped can still be marked Delivered", async ({ page }) => {
    const id = "665f000000000000000d3a05";
    await mockApi(page, [order(id, { paymentMethod: "Razorpay", isPaid: false, orderStatus: "Shipped" })]);
    await page.goto("/admin/orders");

    const select = statusSelectOf(page, id);
    await expect(select).toBeVisible();
    await expect(select.locator('option[value="Delivered"]')).toBeEnabled();
  });
});
