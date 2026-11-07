// The COD FAQ answer names the COD charge (SiteSettings.codCharge, added at
// checkout) instead of letting it first appear at checkout. Same wording in
// the visible FAQ (src/components/Faq/Faq.jsx) and the bot-rendered
// homepage FAQ + FAQPage JSON-LD (api/render.js).
//   node --test scripts/faq-cod-charge.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

let settings = {};
globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html` || url === `${SITE}/home.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/settings`) return json({ success: true, settings });
  if (url === `${API}/api/categories`) return json({ success: true, categories: [] });
  if (url === `${API}/api/subcategories`) return json({ success: true, subcategories: [] });
  if (url === `${API}/api/rewards/public`) return json({ success: true, loyalty: { earnRate: 20 } });
  if (url.startsWith(`${API}/api/products/`)) return json({ success: true, products: [] });
  throw new Error(`unexpected fetch ${url}`);
};

async function renderHome(nextSettings) {
  settings = nextSettings;
  let status = 200;
  let body = "";
  const res = { setHeader() {}, status(c) { status = c; return res; }, send(b) { body = b; }, redirect(c, u) { status = c; body = u; } };
  await handler({ query: { path: "/" }, headers: { "user-agent": "Googlebot/2.1", host: "www.mittalcollections.com" } }, res);
  return { status, body };
}

const codAnswer = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => [JSON.parse(m[1])].flat())
    .find((d) => d["@type"] === "FAQPage")
    ?.mainEntity.find((q) => q.name === "Is Cash on Delivery (COD) available?")?.acceptedAnswer.text;

const EN_50 = "Cash on Delivery (COD) may be available for eligible PIN codes. A ₹50 COD charge applies to COD orders.";

test("bot homepage FAQ states the ₹50 COD charge (JSON-LD and visible text)", async () => {
  const { status, body } = await renderHome({ codCharge: 50, freeShippingThreshold: 499 });
  assert.equal(status, 200);
  assert.equal(codAnswer(body), EN_50);
  assert.ok(body.includes(EN_50), "visible bot FAQ text");
  assert.doesNotMatch(body, /Check availability at checkout/);
});

test("the amount follows the codCharge setting; 0 drops the sentence; missing defaults to 50", async () => {
  assert.equal(
    codAnswer((await renderHome({ codCharge: 30 })).body),
    "Cash on Delivery (COD) may be available for eligible PIN codes. A ₹30 COD charge applies to COD orders.",
  );
  assert.equal(codAnswer((await renderHome({ codCharge: 0 })).body), "Cash on Delivery (COD) may be available for eligible PIN codes.");
  assert.equal(codAnswer((await renderHome({})).body), EN_50);
});

test("visible FAQ (Faq.jsx) uses the same EN template, the approved HI wording and the setting", () => {
  const faq = read("src/components/Faq/Faq.jsx");
  const render = read("api/render.js");
  const EN_TEMPLATE =
    "`Cash on Delivery (COD) may be available for eligible PIN codes.${codCharge > 0 ? ` A ₹${codCharge} COD charge applies to COD orders.` : \"\"}`";
  assert.ok(faq.includes(EN_TEMPLATE), "Faq.jsx EN");
  assert.ok(render.includes(EN_TEMPLATE), "render.js EN");
  assert.ok(
    faq.includes("`चुनिंदा PIN codes पर Cash on Delivery (COD) उपलब्ध हो सकता है।${codCharge > 0 ? ` COD ऑर्डर पर ₹${codCharge} अतिरिक्त शुल्क लागू होगा।` : \"\"}`"),
    "Faq.jsx HI",
  );
  assert.match(faq, /setCodCharge\(response\.settings\.codCharge \?\? 50\)/);
  assert.match(render, /const codCharge = settings\.codCharge \?\? 50;/);
  assert.doesNotMatch(faq + render, /Check availability at checkout/);
});
