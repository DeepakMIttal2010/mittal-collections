// Bot render of /gifting (api/render.js) must say the same thing as the
// real page (GiftingPage.jsx): same meta description, same visible
// heading. The renderer doesn't share a bundle with client/src, so the
// copy is duplicated by hand -- this test is what stops the two drifting
// apart again (they had different descriptions until 2026-11-16).
//   node --test scripts/render-gifting.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
// CRLF -> LF: a Windows checkout with autocrlf would otherwise break the
// multi-line source matches below.
const PAGE_SRC = fs
  .readFileSync(new URL("../src/pages/GiftingPage.jsx", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

const GIFTING_URL = `${API}/api/products/gifting?limit=8`;
const product = (id, name, price, slug = `slug-${id}`) => ({ _id: id, name, price, slug });
// Shaped like the live data (11-17): 8 bedsheets, 8 comforters, 2 dohars.
const SECTIONS = [
  {
    category: { _id: "c1", name: "Bedsheets", nameHi: "बेडशीट", slug: "bedsheets" },
    products: Array.from({ length: 8 }, (_, i) => product(`b${i}`, `Gift Bedsheet Set ${i}`, 561)),
  },
  {
    category: { _id: "c2", name: "Comforters", nameHi: "कम्फर्टर", slug: "comforters" },
    products: [
      ...Array.from({ length: 7 }, (_, i) => product(`c${i}`, `Comforter ${i}`, 553)),
      product("noslug", "Comforter <Plain> & Co", 425, ""),
    ],
  },
  {
    category: { _id: "c3", name: "Dohars", slug: "dohars" },
    products: [product("d0", "Dohar 0", 765), product("d1", "Dohar 1", 765)],
  },
  // Empty section: never rendered (API already filters these).
  { category: { _id: "c4", name: "Doormats", slug: "doormats" }, products: [] },
];
const ok = (sections) => async () => ({ ok: true, status: 200, json: async () => ({ success: true, sections }) });
let giftingResponse = ok(SECTIONS);

globalThis.fetch = async (url) => {
  url = String(url);
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === GIFTING_URL) return giftingResponse();
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

const pick = (html, re) => html.match(re)?.[1];
// The page's own copy, read from its source rather than retyped here.
const clientDescription = PAGE_SRC.match(/const SEO_DESCRIPTION =\s*"([^"]+)";/)?.[1];
const clientH1 = PAGE_SRC.match(/<h1[^>]*>[\s\S]*?\{t\("([^"]+)", "[^"]+"\)\}\s*<\/h1>/)?.[1];

test("GiftingPage.jsx copy is where this test expects it", () => {
  assert.ok(clientDescription, "SEO_DESCRIPTION constant not found");
  assert.ok(clientH1, "h1 t(en, hi) call not found");
  assert.match(PAGE_SRC, /description=\{SEO_DESCRIPTION\}/);
  assert.match(PAGE_SRC, /<span aria-hidden="true">🎁<\/span>/, "gift emoji should be decorative only");
});

test("/gifting bot output matches the real page's description and heading", async () => {
  const { status, body } = await render("/gifting");
  assert.equal(status, 200);
  assert.equal(pick(body, /<meta name="description" content="([^"]*)"/), clientDescription);
  assert.equal(pick(body, /<h1[^>]*>([^<]*)<\/h1>/), clientH1);
  assert.equal(clientH1, "Home Furnishing Gifts for Every Occasion");
  // Title deliberately unchanged (indexed URL).
  assert.equal(pick(body, /<title>([^<]*)<\/title>/), "Gifting — Home Furnishing Gift Ideas | Mittal Collections");
  assert.equal(pick(body, /<link rel="canonical" href="([^"]+)"/), `${SITE}/gifting`);
});

test("description makes no price, discount or delivery-area claim", () => {
  assert.doesNotMatch(clientDescription, /₹|%|off\b|pan[- ]india|free delivery|free shipping/i);
});

test("other static pages still use their title as the bot h1", async () => {
  for (const [path, h1] of [
    ["/trending", "Top Trending Home Furnishing Products"],
    ["/clearance-sale", "Clearance Sale — Home Furnishing Deals"],
    ["/rewards", "Rewards Program — Earn While You Shop"],
  ]) {
    const { body } = await render(path);
    assert.equal(pick(body, /<h1[^>]*>([^<]*)<\/h1>/), h1, path);
  }
});

// ---- PR-G2: bot gets the visitor's product sections + the gifting guide ----
const { GIFTING_GUIDE, GIFT_BEDSHEET_PATH } = await import("../src/data/giftingGuide.js");
const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());
const hrefs = (html) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
const productHrefs = (html) => hrefs(html).filter((h) => h.includes("/product/"));
// Bot body text with markup removed and entities decoded, for copy checks.
const bodyText = (html) =>
  (html.match(/<body[\s\S]*<\/body>/)?.[0] || html)
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const guideStrings = (lang) => [
  GIFTING_GUIDE.heading[lang],
  ...GIFTING_GUIDE.paragraphs.map((p) => p[lang]),
  GIFTING_GUIDE.link.before[lang] + GIFTING_GUIDE.link.text[lang] + GIFTING_GUIDE.link.after[lang],
  GIFTING_GUIDE.delivery[lang],
];

test("/gifting bot: the visitor's sections, 18 product links, View all links, in page order", async () => {
  giftingResponse = ok(SECTIONS);
  const { status, body } = await render("/gifting");
  assert.equal(status, 200);
  assert.deepEqual([...body.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]), ["Bedsheets", "Comforters", "Dohars", GIFTING_GUIDE.heading.en]);
  const expected = SECTIONS.flatMap((s) => s.products).map((p) => `${SITE}/product/${p._id}${p.slug ? `/${p.slug}` : ""}`);
  assert.equal(expected.length, 18);
  assert.deepEqual(productHrefs(body), expected);
  for (const slug of ["bedsheets", "comforters", "dohars"]) assert.ok(hrefs(body).includes(`${SITE}/category/${slug}`), slug);
  assert.ok(!hrefs(body).includes(`${SITE}/category/doormats`));
  assert.match(body, /Comforter &lt;Plain&gt; &amp; Co<\/a>/, "names escaped");
  // Title, description and h1 unchanged by G2.
  assert.equal(pick(body, /<title>([^<]*)<\/title>/), "Gifting — Home Furnishing Gift Ideas | Mittal Collections");
  assert.equal(pick(body, /<meta name="description" content="([^"]*)"/), clientDescription);
  assert.equal(pick(body, /<h1[^>]*>([^<]*)<\/h1>/), "Home Furnishing Gifts for Every Occasion");
});

test("/gifting bot: guide comes after the products, with the Gift Bedsheets link", async () => {
  giftingResponse = ok(SECTIONS);
  const { body } = await render("/gifting");
  const giftHref = `${SITE}${GIFT_BEDSHEET_PATH}`;
  assert.equal(giftHref, `${SITE}/category/bedsheets/gift-bedsheet`);
  assert.ok(hrefs(body).includes(giftHref));
  assert.match(body, new RegExp(`<a href="${giftHref.replace(/[.*+?^${}()|[\]\/]/g, "\$&")}">Gift Bedsheets</a>`));
  assert.ok(body.lastIndexOf("/product/") < body.indexOf(GIFTING_GUIDE.heading.en), "guide after the product list");
});

test("/gifting bot guide text is exactly the visitor's English guide", async () => {
  giftingResponse = ok(SECTIONS);
  const text = bodyText((await render("/gifting")).body);
  for (const s of guideStrings("en")) assert.ok(text.includes(s), `bot is missing: ${s}`);
  // And the page really renders that data file.
  assert.match(PAGE_SRC, /from "\.\.\/data\/giftingGuide"/);
  assert.match(PAGE_SRC, /GIFTING_GUIDE\.paragraphs\.map/);
  assert.match(PAGE_SRC, /tr\(GIFTING_GUIDE\.delivery\)/);
});

test("guide copy: every string has Hindi, and no price/discount/material/delivery-time claims", () => {
  for (const lang of ["en", "hi"]) {
    for (const s of guideStrings(lang)) {
      assert.ok(s && s.trim().length > 0, `${lang} empty`);
      assert.doesNotMatch(s, /₹|%|\boff\b|pan[- ]india|free (delivery|shipping)|24[- ]hour|cotton|discount|सस्ता|छूट|मुफ़्त/i, `${lang}: ${s}`);
    }
  }
  assert.match(GIFTING_GUIDE.delivery.en, /eligible PIN codes in Uttar Pradesh/);
  assert.match(GIFTING_GUIDE.delivery.hi, /उत्तर प्रदेश/);
  // "gift bedsheet" wording only as the link anchor (cannibalization guard).
  const g = GIFTING_GUIDE;
  const nonLink = [g.heading.en, ...g.paragraphs.map((p) => p.en), g.link.before.en, g.link.after.en, g.delivery.en];
  for (const s of nonLink) assert.doesNotMatch(s, /gift bedsheet/i, s);
  assert.equal(g.link.text.en, "Gift Bedsheets");
});

test("/gifting ItemList: URLs only, page order, no duplicates", async () => {
  const dup = structuredClone(SECTIONS);
  dup[2].products.push(dup[0].products[0]); // same product listed twice
  giftingResponse = ok(dup);
  const { body } = await render("/gifting");
  const list = jsonLd(body).find((d) => d["@type"] === "ItemList");
  const urls = list.itemListElement.map((i) => i.url);
  assert.equal(urls.length, 18);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(list.itemListElement.map((i) => i.position), urls.map((_, i) => i + 1));
  assert.ok(list.itemListElement.every((i) => Object.keys(i).sort().join() === "@type,position,url"), "no price/stock/offer");
  assert.ok(jsonLd(body).some((d) => d["@type"] === "BreadcrumbList"));
});

test("/gifting bot: API failure -> still 200, same head, guide only, no ItemList", async () => {
  for (const failing of [
    async () => { throw new Error("timeout"); },
    async () => ({ ok: true, status: 200, json: async () => ({ success: false }) }),
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
  ]) {
    giftingResponse = failing;
    const { status, body } = await render("/gifting");
    assert.equal(status, 200);
    assert.equal(pick(body, /<h1[^>]*>([^<]*)<\/h1>/), "Home Furnishing Gifts for Every Occasion");
    assert.equal(productHrefs(body).length, 0);
    assert.ok(hrefs(body).includes(`${SITE}${GIFT_BEDSHEET_PATH}`));
    assert.ok(!jsonLd(body).some((d) => d["@type"] === "ItemList"));
  }
  giftingResponse = ok(SECTIONS);
});
