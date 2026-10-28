// Which size the bot-rendered / prepaint product page (api/render.js)
// prices and labels by default — must match ProductDetails.jsx: an
// explicit ?size= wins, otherwise the first size in stock, and the first
// size only when every size is sold out. Runs the real handler against a
// mocked API, same harness as render-buying-guides.test.mjs.
//   node --test scripts/render-default-variant.test.mjs
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

let currentProduct;
globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/products/${P._id}`) return json({ ...BASE, product: currentProduct });
  if (url === `${API}/api/settings`) return json({ success: true, settings: {} });
  if (url.startsWith(`${API}/api/reviews/`)) return json({ success: true, reviews: [] });
  if (url.startsWith(`${API}/api/questions/`)) return json({ success: true, questions: [] });
  if (url.startsWith(`${API}/api/products?category=`)) return json({ success: true, products: [] });
  if (url.startsWith(`${API}/api/articles?category=`)) return json({ success: true, articles: [] });
  throw new Error(`unexpected fetch ${url}`);
};

async function render(product, path, size) {
  currentProduct = product;
  let status = 200;
  let body = "";
  const res = { setHeader() {}, status(c) { status = c; return res; }, send(b) { body = b; }, redirect(c, u) { status = c; body = u; } };
  await handler(
    {
      query: { path, ...(size !== undefined && { size }) },
      headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", host: "www.mittalcollections.com" },
    },
    res,
  );
  return { status, body };
}

const withVariants = (variants) => ({
  ...P,
  price: variants[0]?.price ?? P.price,
  stock: variants.reduce((sum, v) => sum + v.stock, 0),
  variants,
});

const SOLD_OUT_FIRST = withVariants([
  { ...P.variants[0], size: "7x4", price: 404, stock: 0 },
  { ...P.variants[1], size: "9x4", price: 468, stock: 6 },
]);

const priceLine = (html) => html.match(/<p>₹([^<]*) — ([^<]*)<\/p>/);
const metaDescription = (html) => html.match(/<meta name="description" content="([^"]*)"/)?.[1];
const productJsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => [JSON.parse(m[1])].flat())
    .flatMap((d) => (Array.isArray(d["@graph"]) ? d["@graph"] : [d]))
    .find((d) => d["@type"] === "Product");

test("first size sold out: price line and meta description use the first in-stock size", async () => {
  const { status, body } = await render(SOLD_OUT_FIRST, EN_PATH);
  assert.equal(status, 200);

  const line = priceLine(body);
  assert.ok(line, "price/availability line missing");
  assert.equal(line[1], "468");
  assert.equal(line[2], "In Stock");
  assert.match(metaDescription(body), /^₹468/);
});

test("same on the Hindi page", async () => {
  const { body } = await render(SOLD_OUT_FIRST, HI_PATH);
  const line = priceLine(body);
  assert.equal(line[1], "468");
  assert.equal(line[2], "उपलब्ध");
  assert.match(metaDescription(body), /^₹468/);
});

test("an explicit ?size= still wins, even when that size is sold out", async () => {
  const { body } = await render(SOLD_OUT_FIRST, EN_PATH, "7x4");
  const line = priceLine(body);
  assert.equal(line[1], "404");
  assert.equal(line[2], "Out of Stock");
  assert.match(metaDescription(body), /^₹404/);
});

test("an unknown ?size= falls back to the first in-stock size", async () => {
  const { body } = await render(SOLD_OUT_FIRST, EN_PATH, "12x12");
  assert.equal(priceLine(body)[1], "468");
});

test("every size sold out: falls back to the first size, shown Out of Stock", async () => {
  const allSoldOut = withVariants([
    { ...P.variants[0], size: "7x4", price: 404, stock: 0 },
    { ...P.variants[1], size: "9x4", price: 468, stock: 0 },
  ]);
  const { body } = await render(allSoldOut, EN_PATH);
  const line = priceLine(body);
  assert.equal(line[1], "404");
  assert.equal(line[2], "Out of Stock");
});

test("first size in stock: unchanged — still the first size", async () => {
  const firstInStock = withVariants([
    { ...P.variants[0], size: "7x4", price: 404, stock: 3 },
    { ...P.variants[1], size: "9x4", price: 468, stock: 6 },
  ]);
  const { body } = await render(firstInStock, EN_PATH);
  assert.equal(priceLine(body)[1], "404");
  assert.match(metaDescription(body), /^₹404/);
});

test("multi-size JSON-LD still lists one Offer per size with its own availability", async () => {
  const { body } = await render(SOLD_OUT_FIRST, EN_PATH);
  const offers = productJsonLd(body)?.offers;
  assert.ok(Array.isArray(offers), "expected an Offer per size");
  assert.deepEqual(
    offers.map((o) => [o.price, o.availability]),
    [
      [404, "https://schema.org/OutOfStock"],
      [468, "https://schema.org/InStock"],
    ],
  );
});

test("a product without sizes uses its own price and stock", async () => {
  const flat = { ...P, price: 299, stock: 4, variants: [] };
  const { body } = await render(flat, EN_PATH);
  const line = priceLine(body);
  assert.equal(line[1], "299");
  assert.equal(line[2], "In Stock");
  const offer = productJsonLd(body)?.offers;
  assert.equal(offer.price, 299);
  assert.equal(offer.availability, "https://schema.org/InStock");
});
