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
