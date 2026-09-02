import { test, expect } from "@playwright/test";

import { createTestUser, createTestAdmin, loginAs } from "./helpers.js";

// Shared across every test in this file (rather than one fresh
// register+login per test) to stay well under the 20-req/15min auth
// rate limiter — see server/tests/security.test.js for the limiter's
// own dedicated test.
let sharedCustomer;
let sharedAdmin;

test.beforeAll(async ({ request }) => {
  sharedCustomer = await createTestUser(request);
  sharedAdmin = await createTestAdmin(request);
});

test("a non-admin account cannot reach the admin panel", async ({
  page,
  context,
}) => {
  await loginAs(context, sharedCustomer);

  await page.goto("/admin");
  // AdminProtectedRoute appends ?redirect= so a login can send the user
  // back to where they were headed — match the path, not the full URL.
  await expect(page).toHaveURL(/\/admin\/login(\?|$)/);
});

test("an unauthenticated visitor is redirected to admin login", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login(\?|$)/);
});

test("admin login form rejects a non-admin account with an alert, not a silent failure", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByPlaceholder(/email/i).fill(sharedCustomer.user.email);
  await page.getByPlaceholder(/password/i).fill("TestPassword123!");

  const dialogPromise = page.waitForEvent("dialog");
  await page.getByRole("button", { name: /login/i }).click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toMatch(/admin only/i);
  await dialog.accept();
});

test("a logged-in admin reaches the dashboard and sees the notification bell", async ({
  page,
  context,
}) => {
  await loginAs(context, sharedAdmin);

  await page.goto("/admin");
  await expect(page).toHaveURL("/admin");
  await expect(page.locator(".notification-btn")).toBeVisible();
});

test("admin notification bell shows a new order and clicking navigates to Orders", async ({
  page,
  context,
  request,
}) => {
  await request.post("http://localhost:5000/api/orders", {
    headers: { Authorization: `Bearer ${sharedCustomer.token}` },
    data: {
      orderItems: [
        {
          product: "6a64556a561a6d5a63017fb2",
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

  await loginAs(context, sharedAdmin);
  await page.goto("/admin");

  const bellButton = page.locator(".notification-btn");
  await bellButton.click();
  await expect(page.getByText(/new order from/i).first()).toBeVisible({
    timeout: 10000,
  });

  await page.getByText(/new order from/i).first().click();
  await expect(page).toHaveURL(/\/admin\/orders/);
});
