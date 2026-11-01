// The bot-rendered product page (api/render.js) must not advertise
// shipping to all of India — orders are limited to eligible Uttar Pradesh
// PIN codes — while keeping the rest of its Product/Offer structured data.
// Same mocked-API harness as render-default-variant.test.mjs.
//   node --test scripts/render-delivery-claims.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const BASE = JSON.parse(
  fs.readFileSync(new URL("./fixtures/render-product-satin-curtain.json", import.meta.url), "utf8"),
);
const P = BASE.product;
const EN_PATH = `/product/${P._id}/${P.slug}`;
const HI_PATH = `/hi${EN_PATH}`;

let currentProduct = P;
globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/products/${P._id}`) return json({ ...BASE, product: currentProduct });
  if (url === `${API}/api/settings`) return json({ success: true, settings: { freeShippingThreshold: 499 } });
  if (url.startsWith(`${API}/api/reviews/`)) return json({ success: true, reviews: [] });
  if (url.startsWith(`${API}/api/questions/`)) return json({ success: true, questions: [] });
  if (url.startsWith(`${API}/api/products?category=`)) return json({ success: true, products: [] });
  if (url.startsWith(`${API}/api/articles?category=`)) return json({ success: true, articles: [] });
  throw new Error(`unexpected fetch ${url}`);
};

async function render(product, path) {
  currentProduct = product;
  let status = 200;
  let body = "";
  const res = { setHeader() {}, status(c) { status = c; return res; }, send(b) { body = b; }, redirect(c, u) { status = c; body = u; } };
  await handler(
    {
      query: { path },
      headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", host: "www.mittalcollections.com" },
    },
    res,
  );
  return { status, body };
}

const metaDescription = (html) => html.match(/<meta name="description" content="([^"]*)"/)?.[1];
const productJsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => [JSON.parse(m[1])].flat())
    .flatMap((d) => (Array.isArray(d["@graph"]) ? d["@graph"] : [d]))
    .find((d) => d["@type"] === "Product");

test("product JSON-LD has no shippingDetails but keeps the rest of Product/Offer", async () => {
  const flat = { ...P, price: 299, stock: 4, variants: [] };
  const { status, body } = await render(flat, EN_PATH);
  assert.equal(status, 200);

  const product = productJsonLd(body);
  assert.ok(product, "Product JSON-LD missing");
  assert.ok(!JSON.stringify(product).includes("shippingDetails"), "shippingDetails must be gone");
  assert.ok(!JSON.stringify(product).includes("OfferShippingDetails"));

  assert.equal(product.sku, P._id);
  assert.ok(product.name);
  assert.ok(product.brand?.name);
  assert.ok(product.image?.length > 0);

  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  assert.equal(offer.price, 299);
  assert.equal(offer.priceCurrency, "INR");
  assert.equal(offer.availability, "https://schema.org/InStock");
  assert.equal(offer.hasMerchantReturnPolicy?.["@type"], "MerchantReturnPolicy");
});

test("multi-size products: no Offer carries shippingDetails", async () => {
  const { body } = await render(P, EN_PATH);
  const offers = [productJsonLd(body)?.offers].flat();
  assert.ok(offers.length >= 1);
  for (const offer of offers) {
    assert.equal(offer.shippingDetails, undefined);
    assert.ok(offer.price !== undefined && offer.priceCurrency === "INR");
  }
});

test("EN and HI meta descriptions keep only the qualified local Ghaziabad promise", async () => {
  const flat = { ...P, price: 299, stock: 4, variants: [] };

  const en = metaDescription((await render(flat, EN_PATH)).body);
  assert.match(en, /^₹299\. 24-hour delivery in selected Ghaziabad PIN codes\. /);
  assert.doesNotMatch(en, /pan[- ]?india|same[- ]day/i);

  const hi = metaDescription((await render(flat, HI_PATH)).body);
  assert.match(hi, /^₹299। गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी। /);
  assert.doesNotMatch(hi, /सेम-डे|उसी दिन/);
  assert.doesNotMatch(hi, /पूरे भारत/);
});
