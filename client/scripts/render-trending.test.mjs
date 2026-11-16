// Bot render of /trending (api/render.js): real category sections with
// product + "View all" links and an ItemList, matching what a visitor sees;
// falls back to the old simple body when the trending API fails.
//   node --test scripts/render-trending.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const TRENDING_URL = `${API}/api/products/trending-by-category?limit=8`;

const SECTIONS = [
  {
    category: { _id: "c1", name: "Bedsheets", nameHi: "बेडशीट", slug: "bedsheets" },
    products: [
      { _id: "p1", slug: "rose-double-bedsheet", name: "Rose Double Bedsheet", nameHi: "रोज़ बेडशीट", price: 574 },
      { _id: "p2", name: "Plain <Sheet> & Co", price: 323 },
    ],
  },
  {
    category: { _id: "c2", name: "Curtains", slug: "curtains" },
    products: [{ _id: "p3", slug: "teal-curtain", name: "Teal Curtain", price: 404 }],
  },
  // Empty section: never rendered (API already filters these, belt and braces).
  { category: { _id: "c3", name: "Doormats", slug: "doormats" }, products: [] },
];

let trendingResponse;
globalThis.fetch = async (url) => {
  url = String(url);
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === TRENDING_URL) return trendingResponse();
  throw new Error(`unexpected fetch ${url}`);
};

async function render(path) {
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

const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());
const hrefs = (html) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);

test("/trending: sections, product links, View all links and ItemList in page order", async () => {
  trendingResponse = async () => ({ ok: true, status: 200, json: async () => ({ success: true, sections: SECTIONS }) });
  const { status, body } = await render("/trending");
  assert.equal(status, 200);
  assert.equal(body.match(/<title>([^<]*)<\/title>/)?.[1], "Top Trending Home Furnishing Products | Mittal Collections");
  assert.equal(body.match(/<link rel="canonical" href="([^"]+)"/)?.[1], `${SITE}/trending`);
  assert.match(body, /<h1>Top Trending Home Furnishing Products<\/h1>/);
  assert.deepEqual([...body.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]), ["Bedsheets", "Curtains"]);

  const links = hrefs(body);
  for (const href of [
    `${SITE}/product/p1/rose-double-bedsheet`,
    `${SITE}/product/p2`,
    `${SITE}/product/p3/teal-curtain`,
    `${SITE}/category/bedsheets`,
    `${SITE}/category/curtains`,
  ]) {
    assert.ok(links.includes(href), href);
  }
  assert.ok(!links.includes(`${SITE}/category/doormats`));
  assert.match(body, /Rose Double Bedsheet<\/a> - ₹574/);
  // Product names are escaped.
  assert.match(body, /Plain &lt;Sheet&gt; &amp; Co<\/a>/);

  const itemList = jsonLd(body).find((d) => d["@type"] === "ItemList");
  assert.deepEqual(
    itemList.itemListElement.map((i) => [i.position, i.url]),
    [
      [1, `${SITE}/product/p1/rose-double-bedsheet`],
      [2, `${SITE}/product/p2`],
      [3, `${SITE}/product/p3/teal-curtain`],
    ],
  );
  // No price/offer claims in the list markup.
  assert.ok(itemList.itemListElement.every((i) => Object.keys(i).sort().join() === "@type,position,url"));
  assert.ok(jsonLd(body).some((d) => d["@type"] === "BreadcrumbList"));
});

test("/trending: API failure falls back to the simple body, still 200", async () => {
  trendingResponse = async () => {
    throw new Error("timeout");
  };
  const { status, body } = await render("/trending");
  assert.equal(status, 200);
  assert.match(body, /<h1>Top Trending Home Furnishing Products<\/h1>/);
  assert.doesNotMatch(body, /<h2>/);
  assert.ok(!jsonLd(body).some((d) => d["@type"] === "ItemList"));
});

test("/trending: success:false falls back too", async () => {
  trendingResponse = async () => ({ ok: true, status: 200, json: async () => ({ success: false }) });
  const { status, body } = await render("/trending");
  assert.equal(status, 200);
  assert.doesNotMatch(body, /\/product\//);
});
