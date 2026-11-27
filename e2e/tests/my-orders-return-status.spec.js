import { test, expect } from "@playwright/test";

// My Orders -> Cancel/Return audit 2026-11-27, OR-01 + OR-04.
// OR-01: after a reload, an item with an open or fully refunded return
// offered "Return this item" again; now the line says where its return is.
// OR-04: the return form offered the full line quantity even when part of
// it was already refunded; now it offers only what is left.
// All API calls are mocked. Unmocked calls and every non-GET are aborted,
// except the mocked POST /api/returns, which never leaves the browser.

const DELIVERED_AT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const DEADLINE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

const line = (quantity, returnInfo) => ({
  _id: "line1",
  product: "p1",
  name: "Gulmohar Winter Flannel King Size Bedsheet",
  image: "",
  price: 1275,
  quantity,
  size: "",
  returnInfo: { isReturnable: true, periodDays: 7, deadline: DEADLINE, ...returnInfo },
});

const orderWith = (item) => ({
  _id: "o1",
  orderStatus: "Delivered",
  deliveredAt: DELIVERED_AT,
  createdAt: DELIVERED_AT,
  paymentMethod: "COD",
  isPaid: true,
  totalPrice: item.price * item.quantity,
  itemsPrice: item.price * item.quantity,
  orderItems: [item],
  shippingAddress: { fullName: "Test", address: "Sector 3", city: "Ghaziabad", state: "Uttar Pradesh", pincode: "201012", mobile: "9999999999" },
  statusHistory: [],
});

async function setup(page, { item, lang = "en" }) {
  const posted = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/") || url.port === "5173") {
      return req.method() === "GET" ? route.continue() : route.abort();
    }
    const p = url.pathname;
    if (req.method() === "POST" && p === "/api/returns") {
      posted.push(req.postDataJSON());
      return route.fulfill({ status: 201, json: { success: true, returnRequest: { _id: "r-new", status: "Requested" } } });
    }
    if (req.method() !== "GET") return route.abort();
    if (p === "/api/orders/myorders") return route.fulfill({ json: { success: true, orders: [orderWith(item)] } });
    if (p === "/api/settings") return route.fulfill({ json: { success: true, settings: { freeShippingThreshold: 499, codCharge: 50, shippingTiers: [] } } });
    if (p === "/api/rewards/public") {
      return route.fulfill({
        json: { success: true, loyalty: { earnRate: 20, redeemValue: 1, maxRedeemPercent: 0.1, pointsValidityDays: 365 }, referral: { referrerPoints: 100, refereePoints: 50 } },
      });
    }
    return route.abort();
  });
  await page.addInitScript(
    ({ lang }) => {
      // Only the first time: a test may switch language and reload.
      if (!localStorage.getItem("language")) localStorage.setItem("language", lang);
      localStorage.setItem("mc_welcome_popup_shown_at", String(Date.now()));
      localStorage.setItem("token", "e2e-token");
      localStorage.setItem("user", JSON.stringify({ _id: "u1", name: "Test", email: "t@example.com", role: "user" }));
    },
    { lang },
  );
  return posted;
}

const card = (page) => page.locator("main");

test.describe("My Orders: return status per item", () => {
  test("OR-E1 an open return, after a reload: status shown, no Return button (EN + HI)", async ({ page }) => {
    await setup(page, { item: line(1, { eligible: false, openReturn: { status: "Requested", quantity: 1 }, refundedQty: 0, remainingQty: 0 }) });
    await page.goto("/my-orders");
    await expect(card(page).getByTestId("return-status")).toHaveText("Return requested");
    await expect(card(page).getByRole("button", { name: "Return this item" })).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem("language", "hi"));
    await page.reload();
    await expect(card(page).getByTestId("return-status")).toHaveText("रिटर्न का अनुरोध किया गया");
    await expect(card(page).getByRole("button", { name: "यह आइटम रिटर्न करें" })).toHaveCount(0);
  });

  test("OR-E1b Approved and Picked Up returns are named too", async ({ page }) => {
    await setup(page, { item: line(2, { eligible: false, openReturn: { status: "Picked Up", quantity: 1 }, refundedQty: 0, remainingQty: 1 }) });
    await page.goto("/my-orders");
    await expect(card(page).getByTestId("return-status")).toHaveText("Return picked up");
    await expect(card(page).getByRole("button", { name: "Return this item" })).toHaveCount(0);
  });

  test("OR-E2 the whole line refunded: 'Returned & refunded', no Return button", async ({ page }) => {
    await setup(page, { item: line(2, { eligible: false, openReturn: null, refundedQty: 2, remainingQty: 0 }) });
    await page.goto("/my-orders");
    await expect(card(page).getByTestId("return-status")).toHaveText("Returned & refunded");
    await expect(card(page).getByRole("button", { name: "Return this item" })).toHaveCount(0);
  });

  test("OR-E3 part refunded: '1 of 2' shown, the form offers only the remaining 1 and sends quantity 1", async ({ page }) => {
    const posted = await setup(page, { item: line(2, { eligible: true, openReturn: null, refundedQty: 1, remainingQty: 1 }) });
    await page.goto("/my-orders");
    await expect(card(page).getByTestId("return-status")).toHaveText("1 of 2 returned & refunded");
    await card(page).getByRole("button", { name: "Return this item" }).click();

    // One piece left: no quantity choice to make (as for a quantity-1 line).
    await expect(page.getByRole("dialog").getByRole("spinbutton")).toHaveCount(0);
    await page.getByRole("dialog").getByRole("textbox").fill("Wrong size");
    await page.getByRole("dialog").getByRole("button", { name: "Submit Return Request" }).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].quantity).toBe(1);
  });

  test("OR-E3b three pieces, one refunded: the quantity field allows at most 2, starting at 2", async ({ page }) => {
    await setup(page, { item: line(3, { eligible: true, openReturn: null, refundedQty: 1, remainingQty: 2 }) });
    await page.goto("/my-orders");
    await card(page).getByRole("button", { name: "Return this item" }).click();
    const qty = page.getByRole("dialog").getByRole("spinbutton");
    await expect(qty).toHaveAttribute("max", "2");
    await expect(qty).toHaveValue("2");
  });

  test("OR-E4 guard: nothing returned yet -> Return button and the full quantity", async ({ page }) => {
    await setup(page, { item: line(2, { eligible: true, openReturn: null, refundedQty: 0, remainingQty: 2 }) });
    await page.goto("/my-orders");
    await expect(card(page).getByTestId("return-status")).toHaveCount(0);
    await card(page).getByRole("button", { name: "Return this item" }).click();
    const qty = page.getByRole("dialog").getByRole("spinbutton");
    await expect(qty).toHaveAttribute("max", "2");
    await expect(qty).toHaveValue("2");
  });

  test("OR-E5 guard: an older server without the new fields still shows the button and full quantity", async ({ page }) => {
    await setup(page, { item: line(2, { eligible: true }) });
    await page.goto("/my-orders");
    await card(page).getByRole("button", { name: "Return this item" }).click();
    await expect(page.getByRole("dialog").getByRole("spinbutton")).toHaveAttribute("max", "2");
  });
});
