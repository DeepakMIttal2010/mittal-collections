// sitemap.xml (api/sitemap.js) lists /new-arrivals and /hi/new-arrivals as
// a hreflang pair, like the articles listing; the other landing pages keep
// a single English entry with no alternates.
//   node --test scripts/sitemap-new-arrivals.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

process.env.VITE_API_URL = "https://api.test";
const { default: handler } = await import("../api/sitemap.js");
const SITE = "https://www.mittalcollections.com";

// The catalog API is down: the static routes are still emitted.
globalThis.fetch = async () => {
  throw new Error("offline");
};

async function sitemap() {
  let body = "";
  const res = { setHeader() {}, status() { return res; }, send(b) { body = b; }, end(b) { body = b ?? body; } };
  await handler({ headers: {} }, res);
  return body;
}

const entry = (xml, loc) => xml.match(new RegExp(`<url><loc>${SITE}${loc}</loc>[\\s\\S]*?</url>`))?.[0];
const alternates = (url) =>
  Object.fromEntries([...url.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));

const PAIR = { en: `${SITE}/new-arrivals`, hi: `${SITE}/hi/new-arrivals`, "x-default": `${SITE}/new-arrivals` };

test("both New Arrivals URLs are listed with the same hreflang pair", async () => {
  const xml = await sitemap();
  for (const loc of ["/new-arrivals", "/hi/new-arrivals"]) {
    const url = entry(xml, loc);
    assert.ok(url, `${loc} missing`);
    assert.deepEqual(alternates(url), PAIR, loc);
  }
});

test("other landing pages stay single English entries", async () => {
  const xml = await sitemap();
  for (const loc of ["/trending", "/clearance-sale", "/gifting"]) {
    const url = entry(xml, loc);
    assert.ok(url, `${loc} missing`);
    assert.deepEqual(alternates(url), {}, loc);
  }
  for (const loc of ["/hi/trending", "/hi/clearance-sale", "/hi/gifting"]) {
    assert.equal(entry(xml, loc), undefined, loc);
  }
});
