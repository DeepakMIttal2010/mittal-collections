import { test, expect } from "@playwright/test";

// OR-03 (My Orders audit 2026-11-27): the homepage FAQ's return answer
// promised every refund within 5-7 business days; a COD refund is arranged
// by UPI or bank transfer with no day promise. Checks the answer a shopper
// actually sees, EN and HI.
// Every API GET gets an empty success reply; every non-GET is aborted.

const EN =
  "You can return an unused product in its original packaging within 7 days of delivery. Once we receive and inspect the returned item, refunds for online payments are processed to the original payment method within 5–7 business days. For Cash on Delivery (COD) orders, our team will contact you to arrange the refund through UPI or bank transfer.";
const HI =
  "आप डिलीवरी के 7 दिनों के भीतर बिना इस्तेमाल किए प्रोडक्ट को उसकी मूल पैकेजिंग में वापस कर सकते हैं। रिटर्न किया गया आइटम मिलने और जांचने के बाद, ऑनलाइन भुगतान का रिफंड मूल भुगतान माध्यम में 5–7 कार्यदिवसों के भीतर प्रोसेस किया जाता है। कैश ऑन डिलीवरी (COD) ऑर्डर के लिए हमारी टीम UPI या बैंक ट्रांसफर से रिफंड की व्यवस्था करने के लिए आपसे संपर्क करेगी।";

// The whole homepage loads from the vite dev server before the FAQ shows;
// 30 s was not enough on this machine.
test.setTimeout(120_000);

async function setup(page, lang) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== "GET") return route.abort();
    if (url.pathname === "/api/rewards/public") {
      return route.fulfill({
        json: { success: true, loyalty: { earnRate: 20, redeemValue: 1, maxRedeemPercent: 0.1, pointsValidityDays: 365 }, referral: { referrerPoints: 100, refereePoints: 50 } },
      });
    }
    if (url.pathname === "/api/settings") {
      return route.fulfill({ json: { success: true, settings: { freeShippingThreshold: 499, codCharge: 50, shippingTiers: [] } } });
    }
    if (url.pathname.startsWith("/api/")) {
      return route.fulfill({ json: { success: true, products: [], categories: [], subcategories: [], banners: [], articles: [], reviews: [] } });
    }
    if (url.hostname === "localhost") return route.continue();
    return route.abort();
  });
  await page.addInitScript((lang) => {
    localStorage.setItem("language", lang);
    localStorage.setItem("mc_welcome_popup_shown_at", String(Date.now()));
  }, lang);
}

test("OR-03 FAQ EN: online and COD refunds described separately", async ({ page }) => {
  await setup(page, "en");
  await page.goto("/");
  await page.getByRole("button", { name: "What is your return policy?" }).click();
  await expect(page.getByText(EN, { exact: true })).toBeVisible();
  await expect(page.getByText(/your refund is processed within 5-7 business days/)).toHaveCount(0);
});

test("OR-03 FAQ HI: the same answer in Hindi", async ({ page }) => {
  await setup(page, "hi");
  // The URL decides the homepage language: Hindi is /hi.
  await page.goto("/hi");
  await page.getByRole("button", { name: "आपकी रिटर्न पॉलिसी क्या है?" }).click();
  await expect(page.getByText(HI, { exact: true })).toBeVisible();
});
