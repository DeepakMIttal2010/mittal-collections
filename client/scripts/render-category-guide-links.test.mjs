// Bot-rendered category pages (api/render.js) link each category's size
// guides. Articles have a /hi version, so Hindi pages link /hi/articles/...;
// the curtain size calculator has no Hindi route, so every page must link
// the plain /curtain-size-calculator (a /hi prefix was a 404 for bots).
// Runs the real handler against a mocked API.
//   node --test scripts/render-category-guide-links.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const CATEGORIES = [
  { _id: "c1", name: "Curtains", nameHi: "पर्दे", slug: "curtains", isActive: true },
  { _id: "c2", name: "Doormats", nameHi: "डोरमैट", slug: "doormats", isActive: true },
];

globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/categories`) return json({ success: true, categories: CATEGORIES });
  if (url === `${API}/api/subcategories`) return json({ success: true, subcategories: [] });
  if (url.startsWith(`${API}/api/products?`)) return json({ success: true, products: [] });
  if (url.startsWith(`${API}/api/settings`)) return json({ success: true, settings: {} });
  throw new Error(`unexpected fetch ${url}`);
};

const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
async function render(path) {
  let status = 200;
  let body = "";
  const res = {
    setHeader() {},
    status(code) { status = code; return res; },
    send(b) { body = String(b); },
    redirect(code) { status = code; },
  };
  await handler({ query: { path }, headers: { host: "www.mittalcollections.com", "user-agent": BOT_UA } }, res);
  return { status, body };
}
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

test("Hindi curtains page links the calculator without a /hi prefix", async () => {
  const { status, body } = await render("/hi/category/curtains");
  assert.equal(status, 200);
  const links = hrefs(body);
  assert.ok(links.includes(`${SITE}/curtain-size-calculator`), "unprefixed calculator link");
  assert.ok(!links.includes(`${SITE}/hi/curtain-size-calculator`), "no /hi calculator link");
});

test("English curtains page links the calculator unchanged", async () => {
  const links = hrefs((await render("/category/curtains")).body);
  assert.ok(links.includes(`${SITE}/curtain-size-calculator`));
});

test("Hindi article guide links keep their /hi prefix", async () => {
  const links = hrefs((await render("/hi/category/doormats")).body);
  assert.ok(links.includes(`${SITE}/hi/articles/how-to-choose-the-right-doormat`));
  assert.ok(!links.includes(`${SITE}/articles/how-to-choose-the-right-doormat`));
});

test("English article guide links stay unprefixed", async () => {
  const links = hrefs((await render("/category/doormats")).body);
  assert.ok(links.includes(`${SITE}/articles/how-to-choose-the-right-doormat`));
});
