import { test, expect } from "@playwright/test";

import { createTestUser, createTestAdmin, loginAs } from "./helpers.js";

const API_BASE = "http://localhost:5000/api";
const PRODUCT_ID = "6a64556a561a6d5a63017fb2";

// Places a real order for the given user (via API) and moves it to
// Processing as admin, which triggers a real order_status notification
// — the same code path server/tests/notifications.test.js exercises,
// but here we're checking the actual bell UI renders it correctly.
const triggerOrderStatusNotification = async (request, testUser, adminUser) => {
  const orderRes = await request.post(`${API_BASE}/orders`, {
    headers: { Authorization: `Bearer ${testUser.token}` },
    data: {
      orderItems: [
        {
          product: PRODUCT_ID,
          name: "Luxury Cotton Bedsheet",
          image: "bedsheet-1.jpg",
          price: 1499,
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: "E2E Test User",
        mobile: "9000000000",
        address: "123 Test Street",
        city: "Ghaziabad",
        state: "Uttar Pradesh",
        pincode: "201012",
      },
      paymentMethod: "COD",
    },
  });
  const orderBody = await orderRes.json();

  await request.put(`${API_BASE}/orders/${orderBody.order._id}/status`, {
    headers: { Authorization: `Bearer ${adminUser.token}` },
    data: { status: "Processing" },
  });
};

// Shared across every test in this file — see admin.spec.js for why
// (stays well under the auth rate limiter across a full suite run).
let testUser;
let adminUser;

test.beforeAll(async ({ request }) => {
  testUser = await createTestUser(request);
  adminUser = await createTestAdmin(request);
});

test("bell shows an unread count, dropdown lists it, click marks read and navigates", async ({
  page,
  context,
  request,
}) => {
  await loginAs(context, testUser);

  await triggerOrderStatusNotification(request, testUser, adminUser);

  await page.goto("/");

  const bell = page.getByRole("button", { name: /alerts/i });
  await expect(bell).toBeVisible();

  // Poll interval is 30s, but the bell also loads on mount — reload to
  // pick up the notification created just now via the API.
  await page.reload();
  await expect(bell.getByText("1")).toBeVisible({ timeout: 10000 });

  await bell.hover();
  const dropdownItem = page.getByText(/your order is being processed/i);
  await expect(dropdownItem).toBeVisible();

  await dropdownItem.click();
  await expect(page).toHaveURL(/\/my-orders\//);

  // Clicking marked it read — badge should be gone now.
  await page.goto("/");
  await expect(bell.getByText("1")).toHaveCount(0);
});

test("/notifications page lists history and mark-all-read clears unread state", async ({
  page,
  context,
  request,
}) => {
  await loginAs(context, testUser);

  await triggerOrderStatusNotification(request, testUser, adminUser);

  await page.goto("/notifications");
  // Sharing testUser with the previous test means their notification
  // is also still present here — .first() since both share this title.
  await expect(
    page.getByText(/your order is being processed/i).first(),
  ).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: /mark all as read/i }).click();
  await expect(
    page.getByRole("button", { name: /mark all as read/i }),
  ).toHaveCount(0);
});

test("bell does not render for a logged-out visitor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /alerts/i })).toHaveCount(0);
});
