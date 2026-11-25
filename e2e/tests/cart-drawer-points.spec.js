import { test, expect } from "@playwright/test";

// Rewards/loyalty audit 2026-11-26, RW-01: the slide-in cart drawer still
// promised points on the pre-discount subtotal (75 on a ₹1505 cart with a
// ₹75 bundle discount) after the cart page was fixed (CK-01, 71). Drawer,
// cart page and checkout must agree. All API calls are mocked; every
// non-GET is aborted.

const RULE = {
  _id: "r1",
  categoryA: { _id: "cat-doormats", name: "Doormats", slug: "doormats" },
  categoryB: { _id: "cat-bedsheets", name: "Bedsheets", slug: "bedsheets" },
  discountPercent: 5,
  isActive: true,
};
const line = (id, name, price, catId, slug) => ({
  _id: id,
  productId: id,
  name,
  slug: id,
  price,
  stock: 5,
  quantity: 1,
  selectedSize: "",
  image: "",
  category: { _id: catId, name: slug, slug },
});
const CART = [
  line("d1", "Rust Orange Cotton Large Doormat", 230, "cat-doormats", "doormats"),
  line("b1", "Gulmohar Winter Flannel King Size Bedsheet", 1275, "cat-bedsheets", "bedsheets"),
];

async function setup(page) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/") || url.port === "5173") return route.continue();
    if (url.pathname === "/api/settings") {
      return route.fulfill({ json: { success: true, settings: { freeShippingThreshold: 499, bundleRules: [RULE] } } });
    }
    if (url.pathname === "/api/rewards/public") {
      // Same shape as the live response (the homepage RewardsStrip also
      // reads referral and reviewBonusPoints).
      return route.fulfill({
        json: {
          success: true,
          loyalty: { earnRate: 20, redeemValue: 1, maxRedeemPercent: 0.1, minRedeemPoints: 0, pointsValidityDays: 365 },
          referral: { referrerPoints: 100, referredPoints: 50 },
          reviewBonusPoints: 50,
        },
      });
    }
    return route.abort();
  });
  await page.addInitScript((cart) => {
    localStorage.setItem("language", "en");
    localStorage.setItem("mc_welcome_popup_shown_at", String(Date.now()));
    localStorage.setItem("cartItems", JSON.stringify(cart));
  }, CART);
}

test("RW-E1 cart drawer promises the same points as the cart page (after the bundle discount)", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: /2 Cart/ }).filter({ visible: true }).first().click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("You'll earn 71 loyalty points on this order");
  await expect(drawer).not.toContainText("You'll earn 75 loyalty points");
});
