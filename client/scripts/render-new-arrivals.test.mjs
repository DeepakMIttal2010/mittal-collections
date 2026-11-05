// Bot render of the New Arrivals page pair (api/render.js): /new-arrivals
// keeps its English output and gains the hreflang pair; /hi/new-arrivals
// is a real Hindi page instead of a 404. Same handler harness as
// render-delivery-claims.test.mjs; no API data is needed for this page.
//   node --test scripts/render-new-arrivals.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

globalThis.fetch = async (url) => {
  url = String(url);
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
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
const hreflangs = (html) =>
  Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
const breadcrumb = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => [JSON.parse(m[1])].flat())
    .find((d) => d["@type"] === "BreadcrumbList");

const PAIR = {
  en: `${SITE}/new-arrivals`,
  hi: `${SITE}/hi/new-arrivals`,
  "x-default": `${SITE}/new-arrivals`,
};

test("/new-arrivals: same English title, canonical and lang, plus the hreflang pair", async () => {
  const { status, body } = await render("/new-arrivals");
  assert.equal(status, 200);
  assert.equal(pick(body, /<title>([^<]*)<\/title>/), "New Arrivals — Home Furnishing | Mittal Collections");
  assert.equal(pick(body, /<link rel="canonical" href="([^"]+)"/), `${SITE}/new-arrivals`);
  assert.equal(pick(body, /<html lang="([^"]+)"/), "en");
  assert.deepEqual(hreflangs(body), PAIR);
  assert.match(body, /<h1[^>]*>New Arrivals — Home Furnishing<\/h1>/);
  const crumbs = breadcrumb(body).itemListElement.map((i) => [i.name, i.item]);
  assert.deepEqual(crumbs, [["Home", `${SITE}/`], ["New Arrivals", undefined]]);
});

test("/hi/new-arrivals: a real Hindi page, self-canonical, same hreflang pair", async () => {
  const { status, body } = await render("/hi/new-arrivals");
  assert.equal(status, 200);
  assert.equal(pick(body, /<title>([^<]*)<\/title>/), "नए प्रोडक्ट्स — होम फर्निशिंग | Mittal Collections");
  assert.equal(pick(body, /<link rel="canonical" href="([^"]+)"/), `${SITE}/hi/new-arrivals`);
  assert.equal(pick(body, /<html lang="([^"]+)"/), "hi");
  assert.doesNotMatch(body, /<meta name="robots" content="[^"]*noindex/);
  assert.deepEqual(hreflangs(body), PAIR);
  assert.match(body, /<h1[^>]*>नए प्रोडक्ट्स — होम फर्निशिंग<\/h1>/);
  const crumbs = breadcrumb(body).itemListElement.map((i) => [i.name, i.item]);
  assert.deepEqual(crumbs, [["होम", `${SITE}/hi`], ["नए प्रोडक्ट्स", undefined]]);
});

test("other landing pages keep their old bot output (no hreflang added)", async () => {
  for (const path of ["/trending", "/clearance-sale", "/gifting"]) {
    const { status, body } = await render(path);
    assert.equal(status, 200, path);
    assert.deepEqual(hreflangs(body), {}, path);
    assert.equal(pick(body, /<link rel="canonical" href="([^"]+)"/), `${SITE}${path}`);
  }
});

test("Hindi versions of the other landing pages are still not pages", async () => {
  for (const path of ["/hi/trending", "/hi/clearance-sale", "/hi/gifting"]) {
    const { status } = await render(path);
    assert.equal(status, 404, path);
  }
});

test("vercel.json sends bots on /hi/new-arrivals to the renderer", () => {
  const { rewrites } = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const hi = rewrites.find((r) => r.source === "/hi/new-arrivals");
  const en = rewrites.find((r) => r.source === "/new-arrivals");
  assert.equal(hi?.destination, "/api/render?path=/hi/new-arrivals");
  assert.deepEqual(hi.has, en.has);
});
