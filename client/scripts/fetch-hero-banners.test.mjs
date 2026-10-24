// Build-time hero banner snapshot: requests <origin>/api/banners (it used
// to request <origin>/banners, a 404 on every Vercel build), writes the
// banners on success and keeps the last known good snapshot otherwise.
//   node --test scripts/fetch-hero-banners.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { snapshotHeroBanners } from "./fetch-hero-banners.mjs";
import { apiBaseFromEnv } from "./apiBase.mjs";

const PROD_ORIGIN = "https://mittal-collections-api.onrender.com"; // VITE_API_URL in the production bundle
const BANNER_7_IMAGE = "https://res.cloudinary.com/y2gghpvz/image/upload/v1792584364/mittal-collections/ngm0ioi5qp88finmu12u.jpg";
const BANNERS = Array.from({ length: 7 }, (_, i) => ({
  _id: `b${i + 1}`,
  title: `Banner ${i + 1}`,
  image: i === 6 ? BANNER_7_IMAGE : `https://res.cloudinary.com/y2gghpvz/image/upload/v1/mittal-collections/b${i + 1}.jpg`,
  displayOrder: i + 1,
  isActive: true,
}));
const LAST_GOOD = JSON.stringify(BANNERS.slice(0, 6), null, 2) + "\n";

const quiet = { log() {}, warn() {} };
const tmpFile = (existing) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hero-banners-"));
  const file = path.join(dir, "heroBannersSnapshot.json");
  if (existing !== undefined) fs.writeFileSync(file, existing);
  return file;
};
const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => body });
const run = (outPath, fetchImpl, attempts = 3) =>
  snapshotHeroBanners({ apiBase: apiBaseFromEnv(PROD_ORIGIN), outPath, fetchImpl, attempts, retryDelayMs: 0, log: quiet });

test("API base: VITE_API_URL is the origin and /api is appended once", () => {
  assert.equal(apiBaseFromEnv(PROD_ORIGIN), `${PROD_ORIGIN}/api`);
  assert.equal(apiBaseFromEnv(`${PROD_ORIGIN}/`), `${PROD_ORIGIN}/api`);
  assert.equal(apiBaseFromEnv(`${PROD_ORIGIN}/api`), `${PROD_ORIGIN}/api`);
  assert.equal(apiBaseFromEnv(`${PROD_ORIGIN}/api/`), `${PROD_ORIGIN}/api`);
  assert.equal(apiBaseFromEnv("http://localhost:5000"), "http://localhost:5000/api");
  assert.equal(apiBaseFromEnv(undefined), `${PROD_ORIGIN}/api`);
});

test("requests /api/banners and writes every banner the API returns, including banner 7", async () => {
  const file = tmpFile(LAST_GOOD);
  const urls = [];
  const result = await run(file, async (url) => (urls.push(url), jsonResponse({ success: true, banners: BANNERS })));
  assert.deepEqual(urls, [`${PROD_ORIGIN}/api/banners`]);
  assert.deepEqual(result, { written: true, count: 7 });
  const written = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(written, BANNERS);
  assert.equal(written[6].image, BANNER_7_IMAGE);
});

test("an HTTP failure keeps the last known good snapshot byte for byte", async () => {
  for (const status of [404, 500, 503]) {
    const file = tmpFile(LAST_GOOD);
    let calls = 0;
    const result = await run(file, async () => (calls++, jsonResponse({ success: false }, status)));
    assert.equal(calls, 3);
    assert.deepEqual(result, { written: false });
    assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
  }
});

test("a network error or malformed body keeps the last known good snapshot", async () => {
  const fetches = [
    async () => { throw new Error("ECONNRESET"); },
    async () => jsonResponse({ success: true }),
    async () => jsonResponse({ success: true, banners: "nope" }),
    async () => jsonResponse(null),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } }),
  ];
  for (const fetchImpl of fetches) {
    const file = tmpFile(LAST_GOOD);
    assert.deepEqual(await run(file, fetchImpl), { written: false });
    assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
  }
});

test("with no snapshot at all, a failed fetch writes nothing (Hero's fallback slide covers it)", async () => {
  const file = tmpFile();
  assert.deepEqual(await run(file, async () => jsonResponse({}, 404)), { written: false });
  assert.equal(fs.existsSync(file), false);
});

test("retries a cold-starting API, then succeeds", async () => {
  const file = tmpFile(LAST_GOOD);
  let calls = 0;
  const result = await run(file, async () => (++calls < 3 ? jsonResponse({}, 503) : jsonResponse({ success: true, banners: BANNERS })));
  assert.equal(calls, 3);
  assert.deepEqual(result, { written: true, count: 7 });
});
