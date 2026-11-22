// Curtain Size Calculator (CS-01/CS-08, 2026-11-22): the bot-rendered page
// (api/render.js) carries its own hand-kept copy of the FAQPage JSON-LD.
// It must match the client's FAQ exactly and never list a size we don't
// sell (we stock only 7x4 ft and 9x4 ft, length x width).
// Runs the real handler against a mocked API.
//   node --test scripts/render-curtain-calculator.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");
const { FAQS_EN } = await import("../src/utils/curtainCalculator.js");

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
