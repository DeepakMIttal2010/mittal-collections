// Bot-rendered product pages (api/render.js) carry the same "Buying
// guides" links BuyingGuides.jsx shows real users. Runs the real handler
// against a mocked API: a real product (fixtures/), the category's
// articles controlled per test.
//   node --test scripts/render-buying-guides.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const PRODUCT = JSON.parse(fs.readFileSync(new URL("./fixtures/render-product-satin-curtain.json", import.meta.url), "utf8"));
const P = PRODUCT.product;
const EN_PATH = `/product/${P._id}/${P.slug}`;
const HI_PATH = `/hi${EN_PATH}`;

const article = (slug, title, extra = {}) => ({ _id: slug, slug, title, excerpt: `${title} excerpt`, titleHi: `${title} (हिंदी)`, excerptHi: "हिंदी सार", category: P.category._id, ...extra });
const GUIDES = [
  article("best-curtains-for-indian-summers", "Best Curtains for Indian Summers"),
  article("satin-vs-velvet-curtains-which-one-is-right-for-your-home", "Satin vs Velvet Curtains: Which One Is Right for Your Home?"),
  article("curtain-measurement-guide", "Curtain Measurement Guide <Size> & \"Fit\"", { titleHi: "" }),
  article("best-curtains-for-indian-summers", "Best Curtains for Indian Summers (duplicate)"),
  { _id: "no-slug", title: "No slug", category: P.category._id },
  article("towel-gsm-guide-how-to-choose", "Towel GSM Guide: Satin Curtain", { category: "6a6453c92bdcd87c2e0ce999" }),
  article("how-to-choose-the-right-curtains-for-your-home", "How to Choose the Right Curtains"),
];

let articlesResponse;
const calls = [];
globalThis.fetch = async (url) => {
  url = String(url);
  calls.push(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/products/${P._id}`) return json(PRODUCT);
  if (url === `${API}/api/settings`) return json({ success: true, settings: {} });
  if (url.startsWith(`${API}/api/reviews/`)) return json({ success: true, reviews: [] });
  if (url.startsWith(`${API}/api/questions/`)) return json({ success: true, questions: [] });
  if (url.startsWith(`${API}/api/products?category=`)) return json({ success: true, products: [] });
  if (url.startsWith(`${API}/api/articles?category=`)) return articlesResponse(url);
  throw new Error(`unexpected fetch ${url}`);
};

async function render(path, articles) {
  articlesResponse = articles;
  calls.length = 0;
  let status = 200;
  let body = "";
  const res = { setHeader() {}, status(c) { status = c; return res; }, send(b) { body = b; }, redirect(c, u) { status = c; body = u; } };
  await handler({ query: { path }, headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", host: "www.mittalcollections.com" } }, res);
  return { status, body };
}
const ok = (articles) => async () => ({ ok: true, status: 200, json: async () => ({ success: true, articles }) });
const guidesNav = (html, label) => html.match(new RegExp(`<nav aria-label="${label}">[\\s\\S]*?</nav>`))?.[0];
const links = (nav) => [...nav.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)].map((m) => ({ href: m[1], text: m[2] }));

test("English product page lists up to 3 ranked, de-duplicated, escaped guide links", async () => {
  const { status, body } = await render(EN_PATH, ok(GUIDES));
  assert.equal(status, 200);
  assert.ok(calls.includes(`${API}/api/articles?category=${P.category._id}`));
  const nav = guidesNav(body, "Buying guides");
  assert.ok(nav, "buying guides section missing");
  const l = links(nav);
  assert.equal(l.length, 3);
  // Product "...Satin Eyelet Curtain...": the satin guide and the
  // "Curtain ..." guide share a word; "Best Curtains..." doesn't (plural).
  assert.deepEqual(l.map((x) => x.href), [
    `${SITE}/articles/satin-vs-velvet-curtains-which-one-is-right-for-your-home`,
    `${SITE}/articles/curtain-measurement-guide`,
    `${SITE}/articles/best-curtains-for-indian-summers`,
  ]);
  assert.equal(new Set(l.map((x) => x.href)).size, 3);
  assert.equal(l[1].text, "Curtain Measurement Guide &lt;Size&gt; &amp; &quot;Fit&quot;");
  assert.ok(!nav.includes("No slug"));
});

test("Hindi product page links Hindi guides to /hi/articles and the rest to English", async () => {
  const { status, body } = await render(HI_PATH, ok(GUIDES));
  assert.equal(status, 200);
  const nav = guidesNav(body, "खरीदने से पहले पढ़ें");
  assert.ok(nav, "Hindi buying guides section missing");
  const l = links(nav);
  assert.deepEqual(l.map((x) => x.href), [
    `${SITE}/hi/articles/satin-vs-velvet-curtains-which-one-is-right-for-your-home`,
    `${SITE}/articles/curtain-measurement-guide`,
    `${SITE}/hi/articles/best-curtains-for-indian-summers`,
  ]);
  assert.equal(l[0].text, "Satin vs Velvet Curtains: Which One Is Right for Your Home? (हिंदी)");
});

test("API failure, error body or empty list: product page renders without the section, otherwise unchanged", async () => {
  const withGuides = (await render(EN_PATH, ok(GUIDES))).body;
  const expected = withGuides.replace(guidesNav(withGuides, "Buying guides"), "");
  const failures = [
    async () => { throw new Error("ECONNRESET"); },
    async () => ({ ok: false, status: 500, json: async () => ({ success: false, message: "Server Error" }) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } }),
    ok([]),
    ok(null),
  ];
  for (const articles of failures) {
    const { status, body } = await render(EN_PATH, articles);
    assert.equal(status, 200);
    assert.equal(guidesNav(body, "Buying guides"), undefined);
    assert.ok(body.includes(`<h1>${P.name}</h1>`) || body.includes("<h1>"), "product h1 missing");
    // Everything else (title, canonical, JSON-LD, product body) is byte-identical.
    assert.equal(body.replace(/\n\s*\n/g, "\n"), expected.replace(/\n\s*\n/g, "\n"));
  }
});

test("an older API that ignores ?category= (articles without a category) shows no guides", async () => {
  const unfiltered = GUIDES.map(({ category, ...a }) => a);
  const { status, body } = await render(EN_PATH, ok(unfiltered));
  assert.equal(status, 200);
  assert.equal(guidesNav(body, "Buying guides"), undefined);
});

test("a product without a category makes no article request", async () => {
  const saved = P.category;
  P.category = null;
  try {
    const { status, body } = await render(EN_PATH, ok(GUIDES));
    assert.equal(status, 200);
    assert.ok(!calls.some((u) => u.includes("/api/articles")));
    assert.equal(guidesNav(body, "Buying guides"), undefined);
  } finally {
    P.category = saved;
  }
});

test("canonical, Product JSON-LD and status are unaffected by the guides", async () => {
  const { status, body } = await render(EN_PATH, ok(GUIDES));
  assert.equal(status, 200);
  assert.match(body, new RegExp(`<link rel="canonical" href="${SITE}${EN_PATH}"`));
  assert.match(body, /"@type":\s*"Product"/);
});
