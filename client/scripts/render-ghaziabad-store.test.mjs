// Ghaziabad store page audit 2026-11-23 (GZ-01/02/03/05): the bot body
// from api/render.js must carry the same visible sections a visitor sees on
// GhaziabadStore.jsx -- h1, intro, the four bullets (returns bullet linked
// to /policies/returns), address + walk-in note, phone, local delivery,
// category links and the contact link -- from a hand-kept copy that must
// deep-equal the client's GHAZIABAD_COPY_EN, with the same walk-in switch.
// Runs the real handler against a mocked API.
//   node --test scripts/render-ghaziabad-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const API = "https://api.test";
process.env.VITE_API_URL = API;
const renderModule = await import("../api/render.js");
const handler = renderModule.default;
const { GHAZIABAD_COPY_EN, WALK_IN_OPEN, listableCategories, walkInNote } = await import("../src/utils/ghaziabadStoreCopy.js");

const SITE = "https://www.mittalcollections.com";
const PATH = "/ghaziabad-home-furnishing-store";
const SHELL = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
// The 13 live categories (2026-11-23) plus two that must never become a
// link: an inactive one and one without a slug.
const LIVE = ["bedsheets", "comforters", "curtains", "cushion-covers", "cushions", "dohars", "doormats",
  "hotel-linen", "mattress-covers", "table-covers", "table-runners", "towels", "toys"];
const CATEGORIES = [
  ...LIVE.map((slug, i) => ({ _id: `c${i}`, name: slug.replace(/-/g, " "), slug, isActive: true })),
  { _id: "x1", name: "Old Range", slug: "old-range", isActive: false },
  { _id: "x2", name: "No Slug", slug: "", isActive: true },
];
let categoriesFail = false;
let settingsPhone = "+91-9999999999";

globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/settings`) return json({ success: true, settings: { phone: settingsPhone } });
  if (url === `${API}/api/categories`) {
    if (categoriesFail) throw new Error("categories down");
    return json({ success: true, categories: CATEGORIES });
  }
  return json({ success: true });
};

const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
async function render() {
  let status = 200;
  let body = "";
  const res = {
    setHeader() {},
    status(code) { status = code; return res; },
    send(b) { body = String(b); },
    redirect(code) { status = code; },
  };
  await handler({ query: { path: PATH }, headers: { host: "www.mittalcollections.com", "user-agent": BOT_UA } }, res);
  return { status, body };
}

// The bot body: what render.js puts inside #root. It holds no <script>, so
// everything from the first "<script" after it is cut off by plain string
// search -- no HTML-filtering regex.
const rootHtml = (html) => (html.split('<div id="root">')[1] || "").split("<script")[0];
const decode = (s) =>
  s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const visibleText = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => decode(m[1]));
const C = GHAZIABAD_COPY_EN;
const bulletText = (b) => b.map((p) => (typeof p === "string" ? p : p.text)).join("");

test("G1 bot h1 is the visitor's h1", async () => {
  const { status, body } = await render();
  assert.equal(status, 200);
  const h1 = rootHtml(body).match(/<h1>([\s\S]*?)<\/h1>/);
  assert.ok(h1, "h1 present");
  assert.equal(decode(h1[1]).trim(), C.heading);
});

test("G2 tagline, sub-tagline and intro", async () => {
  const text = visibleText(rootHtml((await render()).body));
  for (const s of [C.tagline, C.subTagline, C.intro]) assert.ok(text.includes(s), s);
});

test("G3 exactly the four bullets; returns bullet links /policies/returns; no old claims", async () => {
  const root = rootHtml((await render()).body);
  const ul = root.match(/<ul class="gz-bullets">([\s\S]*?)<\/ul>/);
  assert.ok(ul, "bullet list present");
  const items = ul[1].match(/<li>[\s\S]*?<\/li>/g) || [];
  assert.equal(items.length, 4);
  C.bullets.forEach((b, i) => assert.equal(visibleText(items[i]).trim(), bulletText(b), `bullet ${i}`));
  assert.ok(hrefs(ul[1]).includes(`${SITE}/policies/returns`));
  assert.doesNotMatch(visibleText(root), /real photos|what you see is exactly|hassle-free|stand behind every order/i);
});

test("G4 Visit Us: address and the walk-in note while the shop is closed to walk-ins", async () => {
  const text = visibleText(rootHtml((await render()).body));
  for (const s of [C.visit.heading, C.visit.address, C.visit.walkInNote]) assert.ok(text.includes(s), s);
});

test("G5 Call Us with the settings phone as a tel: link", async () => {
  const root = rootHtml((await render()).body);
  assert.ok(visibleText(root).includes(C.call.heading));
  assert.ok(hrefs(root).includes("tel:+91-9999999999"));
});

test("G5b no phone in settings: no Call Us heading and no tel: link (same as the visitor)", async () => {
  settingsPhone = "";
  try {
    const { status, body } = await render();
    assert.equal(status, 200);
    const root = rootHtml(body);
    assert.ok(!visibleText(root).includes(C.call.heading), "no Call Us heading");
    assert.ok(!hrefs(root).some((h) => h.startsWith("tel:")), "no tel: link");
    assert.ok(visibleText(root).includes(C.visit.heading), "rest of the page intact");
  } finally {
    settingsPhone = "+91-9999999999";
  }
});

test("G6 local delivery text and areas", async () => {
  const text = visibleText(rootHtml((await render()).body));
  assert.ok(text.includes(C.delivery.heading));
  assert.ok(text.includes(C.delivery.text));
  assert.ok(text.includes("Vasundhara, Vaishali, Indirapuram"));
});

test("G7 Shop by Category: exactly the 13 listable categories, same rule as the visitor", async () => {
  const root = rootHtml((await render()).body);
  assert.ok(visibleText(root).includes(C.categoriesHeading));
  const catLinks = hrefs(root).filter((h) => h.startsWith(`${SITE}/category/`));
  const expected = listableCategories(CATEGORIES).map((c) => `${SITE}/category/${c.slug}`);
  assert.equal(expected.length, 13);
  assert.deepEqual(catLinks, expected);
  assert.ok(!catLinks.includes(`${SITE}/category/old-range`), "inactive category excluded");
  assert.ok(!catLinks.some((h) => h.endsWith("/category/") || h.endsWith("/undefined")), "no empty slug");
});

test("G8 questions block with the contact link", async () => {
  const root = rootHtml((await render()).body);
  const text = visibleText(root);
  for (const s of [C.questions.heading, C.questions.text, C.questions.cta.text]) assert.ok(text.includes(s), s);
  assert.ok(hrefs(root).includes(`${SITE}/contact`));
});

test("G9 categories API down: still 200, no category section, rest intact", async () => {
  categoriesFail = true;
  try {
    const { status, body } = await render();
    assert.equal(status, 200);
    const root = rootHtml(body);
    assert.ok(visibleText(root).includes(C.visit.walkInNote), "walk-in note still there");
    assert.ok(hrefs(root).includes(`${SITE}/contact`), "contact link still there");
    assert.ok(!visibleText(root).includes(C.categoriesHeading), "no empty category section");
  } finally {
    categoriesFail = false;
  }
});

test("G10 render.js copy and walk-in switch deep-equal the client's", () => {
  assert.ok(renderModule.GHAZIABAD_COPY_EN, "render.js exports GHAZIABAD_COPY_EN");
  assert.deepEqual(renderModule.GHAZIABAD_COPY_EN, GHAZIABAD_COPY_EN);
  assert.equal(renderModule.GHAZIABAD_WALK_IN_OPEN, WALK_IN_OPEN);
});

test("G11 walk-in note: bot and visitor agree in both switch states", () => {
  assert.equal(typeof renderModule.buildGhaziabadBodyHtml, "function", "render.js exports buildGhaziabadBodyHtml");
  for (const open of [false, true]) {
    const html = renderModule.buildGhaziabadBodyHtml({
      breadcrumbItems: [{ name: "Home", path: "/" }, { name: "x" }],
      walkInOpen: open,
      phone: "",
      categories: [],
    });
    const visitorNote = walkInNote(open);
    if (visitorNote) assert.ok(visibleText(html).includes(visitorNote.en), `open=${open}: note shown`);
    else assert.ok(!visibleText(html).includes(C.visit.walkInNote), `open=${open}: note hidden`);
  }
});
