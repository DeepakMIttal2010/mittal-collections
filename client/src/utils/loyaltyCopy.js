// How loyalty points are earned, in the three lengths the site needs
// (rewards/loyalty audit 2026-11-26, RW-02). Points are earned on product
// value after discounts; delivery and COD charges don't count — the old
// "1 point for every ₹20 you spend" suggested otherwise. The amount always
// comes from the live earnRate setting. api/render.js mirrors `faq.en` for
// the bot FAQPage (scripts/loyalty-copy.test.mjs keeps them equal).
export const earnCopy = (earnRate) => ({
  // Homepage FAQ (and its FAQPage JSON-LD).
  faq: {
    en: `Yes! You earn 1 loyalty point for every ₹${earnRate} of product value after discounts — delivery and COD charges don't count — and can redeem points on a future order.`,
    hi: `जी हां! छूट के बाद हर ₹${earnRate} के प्रोडक्ट मूल्य पर 1 लॉयल्टी पॉइंट मिलता है — डिलीवरी और COD शुल्क पर नहीं — और पॉइंट्स अगले ऑर्डर पर इस्तेमाल कर सकते हैं।`,
  },
  // Welcome benefits popup.
  popup: {
    en: `Earn 1 Point for every ₹${earnRate} of products after discounts (delivery & COD charges excluded)`,
    hi: `छूट के बाद हर ₹${earnRate} के प्रोडक्ट मूल्य पर 1 पॉइंट कमाएं (डिलीवरी और COD शुल्क शामिल नहीं)`,
  },
  // Homepage RewardsStrip subtitle (short).
  strip: {
    en: `1 point per ₹${earnRate} of products`,
    hi: `हर ₹${earnRate} के प्रोडक्ट मूल्य पर 1 पॉइंट`,
  },
});
