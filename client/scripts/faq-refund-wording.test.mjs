// OR-03 (My Orders audit 2026-11-27): the return-policy FAQ promised every
// refund "within 5-7 business days". A Cash on Delivery order is refunded
// by UPI or bank transfer arranged by our team, with no day promise (same
// decision as the returns policy page and the "Refunded" email). Same
// wording in the visible FAQ (src/components/Faq/Faq.jsx, EN + HI) and the
// bot-rendered homepage FAQ + FAQPage JSON-LD (api/render.js, EN).
//   node --test scripts/faq-refund-wording.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html` || url === `${SITE}/home.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/settings`) return json({ success: true, settings: { codCharge: 50 } });
  if (url === `${API}/api/categories`) return json({ success: true, categories: [] });
  if (url === `${API}/api/subcategories`) return json({ success: true, subcategories: [] });
  if (url === `${API}/api/rewards/public`) return json({ success: true, loyalty: { earnRate: 20 } });
  if (url.startsWith(`${API}/api/products/`)) return json({ success: true, products: [] });
  throw new Error(`unexpected fetch ${url}`);
};

async function renderHome() {
  let status = 200;
  let body = "";
  const res = { setHeader() {}, status(c) { status = c; return res; }, send(b) { body = b; }, redirect(c, u) { status = c; body = u; } };
  await handler({ query: { path: "/" }, headers: { "user-agent": "Googlebot/2.1", host: "www.mittalcollections.com" } }, res);
  return { status, body };
}

const returnAnswer = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => [JSON.parse(m[1])].flat())
    .find((d) => d["@type"] === "FAQPage")
    ?.mainEntity.find((q) => q.name === "What is your return policy?")?.acceptedAnswer.text;

const EN =
  "You can return an unused product in its original packaging within 7 days of delivery. Once we receive and inspect the returned item, refunds for online payments are processed to the original payment method within 5–7 business days. For Cash on Delivery (COD) orders, our team will contact you to arrange the refund through UPI or bank transfer.";
const HI =
  "आप डिलीवरी के 7 दिनों के भीतर बिना इस्तेमाल किए प्रोडक्ट को उसकी मूल पैकेजिंग में वापस कर सकते हैं। रिटर्न किया गया आइटम मिलने और जांचने के बाद, ऑनलाइन भुगतान का रिफंड मूल भुगतान माध्यम में 5–7 कार्यदिवसों के भीतर प्रोसेस किया जाता है। कैश ऑन डिलीवरी (COD) ऑर्डर के लिए हमारी टीम UPI या बैंक ट्रांसफर से रिफंड की व्यवस्था करने के लिए आपसे संपर्क करेगी।";

test("bot homepage FAQ: return answer splits online and COD refunds (JSON-LD and visible text)", async () => {
  const { status, body } = await renderHome();
  assert.equal(status, 200);
  assert.equal(returnAnswer(body), EN);
  assert.ok(body.includes(EN), "visible bot FAQ text");
  assert.doesNotMatch(body, /your refund is processed within 5-7 business days/);
});

test("visible FAQ (Faq.jsx): the same answer in EN and HI, no flat 5-7 day promise", () => {
  const src = read("src/components/Faq/Faq.jsx");
  assert.ok(src.includes(`"${EN}"`), "EN answer");
  assert.ok(src.includes(`"${HI}"`), "HI answer");
  assert.doesNotMatch(src, /your refund is processed within 5-7 business days/);
  assert.doesNotMatch(src, /आपका रिफंड 5-7 कार्य दिवसों में प्रोसेस/);
});
