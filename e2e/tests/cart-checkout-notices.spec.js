import { test, expect } from "@playwright/test";

// Cart/checkout audit 2026-11-25.
// CK-01: cart and checkout promise the same loyalty points (after the bundle
// discount): 1505 cart with a 5% bundle (-75) -> 71 points, not 75.
// CK-03: a non-returnable product is labelled in the cart and summarised at
// checkout with a Returns Policy link; nothing is shown when every item is
// returnable. All API calls are mocked; every non-GET is aborted.

// Shaped like settings.bundleRules (CartContext / server bundleDiscount.js).
const BUNDLE_RULE = {
  _id: "r1",
  categoryA: { _id: "cat-doormats", name: "Doormats", slug: "doormats" },
  categoryB: { _id: "cat-bedsheets", name: "Bedsheets", slug: "bedsheets" },
  discountPercent: 5,
  isActive: true,
};
const item = (id, name, price, categoryId, categorySlug, isReturnable, nameHi) => ({
  _id: id,
  productId: id,
  name,
  nameHi,
  slug: id,
  price,
  stock: 5,
  quantity: 1,
  selectedSize: "",
  isReturnable,
  image: "",
  category: { _id: categoryId, name: categorySlug, slug: categorySlug },
});
const DOORMAT = item("d1", "Rust Orange Cotton Large Doormat", 230, "cat-doormats", "doormats", false, "रस्ट ऑरेंज कॉटन डोरमैट");
const DOORMAT2 = item("d2", "Navy Cotton Large Doormat", 230, "cat-doormats", "doormats", false);
const BEDSHEET = item("b1", "Gulmohar Winter Flannel King Size Bedsheet", 1275, "cat-bedsheets", "bedsheets", true);

const SETTINGS = {
  success: true,
  settings: {
    freeShippingThreshold: 499,
    deliveryFee: 0,
    codCharge: 50,
    shippingTiers: [
      { maxOrderValue: 99, fee: 49 },
      { maxOrderValue: 199, fee: 39 },
      { maxOrderValue: 299, fee: 29 },
      { maxOrderValue: 399, fee: 19 },
      { maxOrderValue: 499, fee: 9 },
    ],
    bundleRules: [BUNDLE_RULE],
  },
};
const ADDRESS = { _id: "a1", fullName: "Test UP", phone: "9999999999", addressLine1: "Sector 3", city: "Ghaziabad", state: "Uttar Pradesh", pincode: "201012", isDefault: true };
const PIN_OK = { success: true, found: true, fastDelivery: true, deliverable: true, state: "Uttar Pradesh", reason: null };

// `live` overrides what GET /api/products/:id returns for a cart line (the
// product as it is now), e.g. an admin changed its returnability.
async function setup(page, { cart, lang = "en", loggedIn = true, live = {} }) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/") || url.port === "5173") return route.continue();
    const p = url.pathname;
    if (p === "/api/settings") return route.fulfill({ json: SETTINGS });
    if (p === "/api/rewards/public") {
      return route.fulfill({ json: { success: true, loyalty: { earnRate: 20, redeemValue: 1, maxRedeemPercent: 10 } } });
    }
    if (p === "/api/addresses") return route.fulfill({ json: { success: true, addresses: [ADDRESS] } });
    if (p.startsWith("/api/delivery/check-pincode/")) return route.fulfill({ json: PIN_OK });
    if (p === "/api/coupons/first-order-offer") return route.fulfill({ json: { success: true, coupon: null } });
    if (p === "/api/rewards/my-summary") return route.fulfill({ json: { success: true, summary: { available: 0, pendingTotal: 0 } } });
    if (p.startsWith("/api/products/")) {
      const id = p.split("/").pop();
      const found = cart.find((i) => i._id === id);
      if (!found) return route.abort();
      const product = { ...found, _id: id, ...(live[id] || {}) };
      for (const [key, value] of Object.entries(live[id] || {})) if (value === undefined) delete product[key];
      return route.fulfill({ json: { success: true, product } });
    }
    return route.abort();
  });
  await page.addInitScript(
    ({ cart, lang, loggedIn }) => {
      localStorage.setItem("language", lang);
      localStorage.setItem("mc_welcome_popup_shown_at", String(Date.now()));
      localStorage.setItem("cartItems", JSON.stringify(cart));
      if (loggedIn) {
        localStorage.setItem("token", "e2e-token");
        localStorage.setItem("user", JSON.stringify({ _id: "u1", name: "Test", email: "t@example.com", role: "user" }));
      }
    },
    { cart, lang, loggedIn },
  );
}

test.describe("Cart and checkout notices", () => {
  test("CK-E1 cart: non-returnable label only on the doormat; points after the bundle discount", async ({ page }) => {
    await setup(page, { cart: [DOORMAT, BEDSHEET], loggedIn: false });
    await page.goto("/cart");
    const labels = page.getByTestId("cart-nonreturnable");
    await expect(labels).toHaveCount(1);
    await expect(labels).toHaveText("Non-returnable");
    await expect(page.locator(".cart-item").filter({ hasText: "Doormat" }).getByTestId("cart-nonreturnable")).toHaveCount(1);
    // Scoped to the page: the (closed) cart drawer now shows the same line.
    await expect(page.locator("main").getByText("You'll earn 71 loyalty points on this order")).toBeVisible();
  });

  test("CK-E2 checkout: singular summary line with the Returns Policy link; same 71 points", async ({ page }) => {
    await setup(page, { cart: [DOORMAT, BEDSHEET] });
    await page.goto("/checkout");
    const line = page.getByTestId("checkout-nonreturnable");
    await expect(line).toContainText("1 item in this order is non-returnable:");
    await expect(line).toContainText("Rust Orange Cotton Large Doormat");
    await expect(line.getByRole("link", { name: "Returns Policy" })).toHaveAttribute("href", "/policies/returns");
    // Scoped to the page: the (closed) cart drawer now shows the same line.
    await expect(page.locator("main").getByText("You'll earn 71 loyalty points on this order")).toBeVisible();
  });

  test("CK-E3 checkout: plural summary for two non-returnable items", async ({ page }) => {
    await setup(page, { cart: [DOORMAT, DOORMAT2, BEDSHEET] });
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-nonreturnable")).toContainText(
      "2 items in this order are non-returnable: Rust Orange Cotton Large Doormat, Navy Cotton Large Doormat",
    );
  });

  test("CK-E4 only returnable items: no label in the cart, no line at checkout", async ({ page }) => {
    await setup(page, { cart: [BEDSHEET] });
    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.getByTestId("cart-nonreturnable")).toHaveCount(0);
    await page.goto("/checkout");
    await expect(page.getByText("Order Total")).toBeVisible();
    await expect(page.getByTestId("checkout-nonreturnable")).toHaveCount(0);
  });

  test("CK-E5 Hindi: cart label and checkout line", async ({ page }) => {
    await setup(page, { cart: [DOORMAT, BEDSHEET], lang: "hi" });
    await page.goto("/cart");
    await expect(page.getByTestId("cart-nonreturnable")).toHaveText("गैर-वापसी योग्य");
    await page.goto("/checkout");
    const line = page.getByTestId("checkout-nonreturnable");
    await expect(line).toContainText("इस ऑर्डर में 1 प्रोडक्ट गैर-वापसी योग्य है:");
    await expect(line.getByRole("link", { name: "रिटर्न पॉलिसी" })).toHaveAttribute("href", "/policies/returns");
  });

  // P2-1 (review 2026-11-25): the notice must be seen BEFORE "Place Order",
  // which sits at the top of the summary card on every screen width.
  for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 375, height: 740 }]]) {
    test(`CK-E7 ${label}: exactly one notice, directly above Place Order`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setup(page, { cart: [DOORMAT, BEDSHEET] });
      await page.goto("/checkout");
      const notice = page.getByTestId("checkout-nonreturnable");
      await expect(notice).toHaveCount(1);
      await expect(notice).toBeVisible();
      const button = page.getByRole("button", { name: "Place Order" });
      const n = await notice.boundingBox();
      const b = await button.boundingBox();
      expect(n.y + n.height, "notice ends above the button").toBeLessThanOrEqual(b.y);
      expect(b.y - (n.y + n.height), "notice sits directly above the button").toBeLessThan(40);
    });
  }

  // P3-1 (review 2026-11-25): the cart refresh takes returnability from the
  // product as it is now; a missing value is never read as non-returnable.
  test("CK-E8 cart refresh uses the current isReturnable (false and true), ignores a missing value", async ({ page }) => {
    await setup(page, {
      cart: [{ ...BEDSHEET, isReturnable: true }, { ...DOORMAT, isReturnable: false }, { ...DOORMAT2, isReturnable: false }],
      loggedIn: false,
      live: { b1: { isReturnable: false }, d1: { isReturnable: true }, d2: { isReturnable: undefined } },
    });
    await page.goto("/cart");
    const row = (text) => page.locator(".cart-item").filter({ hasText: text });
    await expect(row("Gulmohar").getByTestId("cart-nonreturnable")).toHaveCount(1);
    await expect(row("Rust Orange").getByTestId("cart-nonreturnable")).toHaveCount(0);
    await expect(row("Navy Cotton").getByTestId("cart-nonreturnable")).toHaveCount(1);
  });

  test("CK-E6 mobile cart and checkout: no horizontal overflow with the notices", async ({ page }) => {
    await setup(page, { cart: [DOORMAT, BEDSHEET] });
    for (const [path, ready] of [["/cart", page.locator(".cart-item").first()], ["/checkout", page.getByText("Order Total")]]) {
      await page.goto(path);
      await expect(ready).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBe(0);
    }
  });
});
