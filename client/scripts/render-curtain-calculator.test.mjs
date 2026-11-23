// Curtain Size Calculator (CS-01/CS-08, 2026-11-22): the bot-rendered page
// (api/render.js) carries its own hand-kept copy of the FAQPage JSON-LD.
// It must match the client's FAQ exactly and never list a size we don't
// sell (we stock only 7x4 ft and 9x4 ft, length x width).
// CS-04 (2026-11-23): the bot body must carry the same visible text a
// visitor sees -- intro, how-to-measure + guide link, the two-row size
// chart with its subcategory links, and the FAQ as page text (not only
// inside JSON-LD) -- and nothing a visitor doesn't (no live stock, no
// prices, no calculator result).
// Runs the real handler against a mocked API.
//   node --test scripts/render-curtain-calculator.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler, CURTAIN_PAGE_EN } = await import("../api/render.js");
const { FAQS_EN, PAGE_COPY_EN } = await import("../src/utils/curtainCalculator.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/categories`) return json({ success: true, categories: [] });
  if (url === `${API}/api/subcategories`) return json({ success: true, subcategories: [] });
  if (url.startsWith(`${API}/api/products`)) return json({ success: true, products: [] });
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

const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      const v = JSON.parse(m[1]);
      return Array.isArray(v) ? v : [v];
    });

test("bot FAQPage matches the client FAQ exactly", async () => {
  const { status, body } = await render("/curtain-size-calculator");
  assert.equal(status, 200);
  const faq = jsonLd(body).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "FAQPage present");
  assert.deepEqual(
    faq.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text })),
    FAQS_EN,
  );
});

test("bot page never lists a size we don't sell", async () => {
  const { body } = await render("/curtain-size-calculator");
  const unsold = /\b(3x5|4x5|4x7|4\.5x7|5x7|5x9|7x9)\s?ft\b/i;
  assert.doesNotMatch(body, unsold);
  assert.doesNotMatch(body, /2x is standard/);
});

// The bot body: what render.js puts inside #root. It holds no <script>, so
// everything from the first "<script" after it (the SPA's own tags) is cut
// off by plain string search -- no HTML-filtering regex needed.
const rootHtml = (html) => (html.split('<div id="root">')[1] || "").split("<script")[0];
// Visible text of the bot body, tags stripped, entities decoded.
const visibleText = (html) =>
  rootHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const hrefs = (html) => [...rootHtml(html).matchAll(/href="([^"]+)"/g)].map((m) => decode(m[1]));

test("R1 bot h1 is the visitor's h1", async () => {
  const { body } = await render("/curtain-size-calculator");
  const h1 = rootHtml(body).match(/<h1>([\s\S]*?)<\/h1>/);
  assert.ok(h1, "h1 present");
  assert.equal(decode(h1[1]).trim(), PAGE_COPY_EN.heading);
});

test("R2 bot body carries the visitor's intro", async () => {
  const { body } = await render("/curtain-size-calculator");
  assert.ok(visibleText(body).includes(PAGE_COPY_EN.intro));
});

test("R3 size chart: exactly the two stocked sizes, linked to their subcategories", async () => {
  const { body } = await render("/curtain-size-calculator");
  const text = visibleText(body);
  assert.ok(text.includes(PAGE_COPY_EN.sizes.heading));
  assert.ok(text.includes(PAGE_COPY_EN.sizes.intro));
  const tbody = rootHtml(body).match(/<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(tbody, "size chart table present");
  const rows = tbody[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
  assert.equal(rows.length, 2);
  assert.equal(PAGE_COPY_EN.sizes.rows.length, 2);
  PAGE_COPY_EN.sizes.rows.forEach((row, i) => {
    const rowText = visibleText(`<div id="root">${rows[i]}`);
    for (const s of [row.label, row.fits, row.use]) assert.ok(rowText.includes(s), `${s} in row ${i}`);
    assert.ok(rows[i].includes(`href="${SITE}${row.path}"`), `link ${row.path}`);
  });
  assert.deepEqual(PAGE_COPY_EN.sizes.rows.map((r) => r.path), ["/category/curtains/7x4-ft", "/category/curtains/9x4-ft"]);
});

test("R4 how-to-measure text and the measurement guide link", async () => {
  const { body } = await render("/curtain-size-calculator");
  const text = visibleText(body);
  const m = PAGE_COPY_EN.measure;
  for (const s of [m.heading, m.text, m.guidePrompt.trim(), m.guideLinkText]) assert.ok(text.includes(s), s);
  assert.ok(hrefs(body).includes(`${SITE}/articles/curtain-measurement-guide`));
});

test("R5 every FAQ question and answer is visible page text, not only JSON-LD", async () => {
  const { body } = await render("/curtain-size-calculator");
  const text = visibleText(body);
  assert.ok(text.includes(PAGE_COPY_EN.faqHeading));
  for (const f of FAQS_EN) {
    assert.ok(text.includes(f.q), f.q);
    assert.ok(text.includes(f.a), f.a);
  }
});

test("R6 bot body has no price, stock count or calculator result", async () => {
  const { body } = await render("/curtain-size-calculator");
  const text = visibleText(body);
  assert.doesNotMatch(text, /₹|in stock|designs available|Your Recommended Size/i);
});

test("R3b size chart header: exactly the three visitor column headings", async () => {
  const { body } = await render("/curtain-size-calculator");
  const thead = rootHtml(body).match(/<thead>([\s\S]*?)<\/thead>/);
  assert.ok(thead, "size chart header present");
  const ths = [...thead[1].matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => decode(m[1]).trim());
  assert.deepEqual(ths, ["Size", "Fits", "Best For"]);
  const c = PAGE_COPY_EN.sizes.columns;
  assert.deepEqual(ths, [c.size, c.fits, c.use]);
  const tbody = rootHtml(body).match(/<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(tbody, "size chart body present");
  assert.equal((tbody[1].match(/<tr>/g) || []).length, 2);
});

test("R7 render.js bot copy is field-for-field the client's PAGE_COPY_EN", () => {
  assert.ok(CURTAIN_PAGE_EN, "render.js exports CURTAIN_PAGE_EN");
  assert.deepEqual(CURTAIN_PAGE_EN, PAGE_COPY_EN);
});
