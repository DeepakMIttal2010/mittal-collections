// Rewards/loyalty audit 2026-11-26, RW-02: points are earned on product
// value after discounts — delivery and COD charges don't count (Terms,
// Rewards page) — but the welcome popup, homepage RewardsStrip and FAQ
// (+ the bot FAQPage JSON-LD) said "1 point for every ₹20 you spend".
// One source for the wording (utils/loyaltyCopy.js); the amount always
// comes from the live earnRate setting.
//   node --test scripts/loyalty-copy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { earnCopy } = await import("../src/utils/loyaltyCopy.js");
const { default: handler } = await import("../api/render.js");

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("earnCopy: the three agreed wordings, amount from earnRate", () => {
  const c = earnCopy(20);
  assert.deepEqual(c.faq, {
    en: "Yes! You earn 1 loyalty point for every ₹20 of product value after discounts — delivery and COD charges don't count — and can redeem points on a future order.",
    hi: "जी हां! छूट के बाद हर ₹20 के प्रोडक्ट मूल्य पर 1 लॉयल्टी पॉइंट मिलता है — डिलीवरी और COD शुल्क पर नहीं — और पॉइंट्स अगले ऑर्डर पर इस्तेमाल कर सकते हैं।",
  });
  assert.deepEqual(c.popup, {
    en: "Earn 1 Point for every ₹20 of products after discounts (delivery & COD charges excluded)",
    hi: "छूट के बाद हर ₹20 के प्रोडक्ट मूल्य पर 1 पॉइंट कमाएं (डिलीवरी और COD शुल्क शामिल नहीं)",
  });
  assert.deepEqual(c.strip, { en: "1 point per ₹20 of products", hi: "हर ₹20 के प्रोडक्ट मूल्य पर 1 पॉइंट" });
  const c25 = earnCopy(25);
  for (const k of ["faq", "popup", "strip"]) {
    assert.match(c25[k].en, /₹25 /, k);
    assert.match(c25[k].hi, /₹25 /, k);
  }
});

test("popup, strip and FAQ use earnCopy and no longer say 'you spend' / 'spent' / 'खर्च'", () => {
  for (const [file, key] of [
    ["src/components/WelcomeBenefitsPopup.jsx", "popup"],
    ["src/components/RewardsStrip/RewardsStrip.jsx", "strip"],
    ["src/components/Faq/Faq.jsx", "faq"],
  ]) {
    const src = read(file);
    assert.match(src, /earnCopy\(/, `${file} uses earnCopy`);
    assert.match(src, new RegExp(`\\.${key}\\b`), `${file} uses the ${key} wording`);
    assert.doesNotMatch(src, /you spend|₹\$\{[^}]*\} spent|खर्च (पर|करने पर) 1/, file);
  }
});

test("bot FAQPage answer equals the client FAQ wording (live earnRate)", async () => {
  const SITE = "https://www.mittalcollections.com";
  const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  globalThis.fetch = async (url) => {
    url = String(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
    if (url.startsWith(`${API}/api/rewards/public`)) return json({ success: true, loyalty: { earnRate: 25 } });
    if (url.startsWith(`${API}/api/settings`)) return json({ success: true, settings: {} });
    return json({ success: true, categories: [], subcategories: [], products: [], sections: [], banners: [] });
  };
  let body = "";
  const res = { setHeader() {}, status() { return res; }, send(b) { body = String(b); }, redirect() {} };
  await handler({ query: { path: "/" }, headers: { host: "www.mittalcollections.com", "user-agent": "Googlebot/2.1" } }, res);
  const blocks = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const v = JSON.parse(m[1]);
    return Array.isArray(v) ? v : [v];
  });
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "homepage FAQPage present");
  const q = faq.mainEntity.find((e) => e.name === "Do I earn rewards on my purchase?");
  assert.equal(q.acceptedAnswer.text, earnCopy(25).faq.en);
});
