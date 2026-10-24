// Build-time banner coupon snapshot: writes on a good response, never
// overwrites the last known good snapshot on a failed fetch or a body it
// can't trust.
//   node --test scripts/fetch-banner-coupon.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { apiBaseFromEnv, snapshotBannerCoupon } from "./fetch-banner-coupon.mjs";
import { parseBannerCouponResponse, toBannerCoupon } from "../src/utils/bannerCoupon.js";

const LIVE_COUPON = {
  _id: "6a6ddb09fbd11b01b16cfeff",
  code: "WELCOME10",
  discountType: "percentage",
  discountValue: 10,
  maxDiscount: 1000,
  firstOrderOnly: true,
  description: "10% off your first order, up to ₹1000",
  showAsBanner: true,
  isActive: true,
};
const SNAPSHOT_OF_LIVE = { code: "WELCOME10", discountType: "percentage", discountValue: 10, maxDiscount: 1000, firstOrderOnly: true };
const LAST_GOOD = JSON.stringify({ coupon: { ...SNAPSHOT_OF_LIVE, code: "LASTGOOD" } }, null, 2) + "\n";

const quiet = { log() {}, warn() {} };
const tmpFile = (existing) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "banner-coupon-"));
  const file = path.join(dir, "bannerCouponSnapshot.json");
  if (existing !== undefined) fs.writeFileSync(file, existing);
  return file;
};
const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => body });
const run = (outPath, fetchImpl, attempts = 2) =>
  snapshotBannerCoupon({ apiBase: "http://api.test", outPath, fetchImpl, attempts, retryDelayMs: 0, log: quiet });
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("writes the rendered coupon fields on a successful response", async () => {
  const file = tmpFile(LAST_GOOD);
  let url;
  const result = await run(file, async (u) => ((url = u), jsonResponse({ success: true, coupon: LIVE_COUPON })));
  assert.equal(url, "http://api.test/coupons/banner");
  assert.deepEqual(result, { written: true, coupon: SNAPSHOT_OF_LIVE });
  assert.deepEqual(read(file), { coupon: SNAPSHOT_OF_LIVE });
});

test("an API that says there is no banner coupon writes {coupon: null}", async () => {
  for (const body of [{ success: true, coupon: null }, { success: true, coupon: { ...LIVE_COUPON, isActive: false } }, { success: true, coupon: { ...LIVE_COUPON, showAsBanner: false } }]) {
    const file = tmpFile(LAST_GOOD);
    const result = await run(file, async () => jsonResponse(body));
    assert.deepEqual(result, { written: true, coupon: null });
    assert.deepEqual(read(file), { coupon: null });
  }
});

test("failed fetches keep the last known good snapshot byte for byte", async () => {
  const failures = [
    async () => { throw new Error("ECONNRESET"); },
    async () => jsonResponse({ success: false, message: "Server Error" }, 500),
  ];
  for (const fetchImpl of failures) {
    const file = tmpFile(LAST_GOOD);
    const result = await run(file, fetchImpl);
    assert.deepEqual(result, { written: false });
    assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
  }
});

test("malformed responses keep the last known good snapshot", async () => {
  const bodies = [
    { success: false, coupon: LIVE_COUPON },
    { success: true },
    { success: true, coupon: { ...LIVE_COUPON, code: "" } },
    { success: true, coupon: { ...LIVE_COUPON, discountType: "bogo" } },
    { success: true, coupon: { ...LIVE_COUPON, discountValue: "10" } },
    { success: true, coupon: "WELCOME10" },
    null,
  ];
  for (const body of bodies) {
    const file = tmpFile(LAST_GOOD);
    const result = await run(file, async () => jsonResponse(body));
    assert.deepEqual(result, { written: false }, JSON.stringify(body));
    assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
  }

  const file = tmpFile(LAST_GOOD);
  await run(file, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } }));
  assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
});

test("with no snapshot at all, a failed fetch creates an empty one so the build import resolves", async () => {
  const file = tmpFile();
  const result = await run(file, async () => { throw new Error("offline"); });
  assert.deepEqual(result, { written: false });
  assert.deepEqual(read(file), { coupon: null });
});

test("retries a cold-starting API before giving up", async () => {
  const file = tmpFile(LAST_GOOD);
  let calls = 0;
  const result = await run(file, async () => (++calls === 1 ? jsonResponse({}, 503) : jsonResponse({ success: true, coupon: LIVE_COUPON })), 3);
  assert.equal(calls, 2);
  assert.equal(result.written, true);
});

test("toBannerCoupon / parseBannerCouponResponse", () => {
  assert.deepEqual(toBannerCoupon(LIVE_COUPON), SNAPSHOT_OF_LIVE);
  assert.equal(toBannerCoupon({ ...LIVE_COUPON, maxDiscount: 0 }).maxDiscount, null);
  assert.equal(toBannerCoupon(null), null);
  assert.equal(toBannerCoupon({ ...LIVE_COUPON, isActive: false }), null);
  assert.deepEqual(parseBannerCouponResponse({ success: false, coupon: null }), { ok: false });
  assert.deepEqual(parseBannerCouponResponse({ success: true, coupon: null }), { ok: true, coupon: null });
});

test("API base matches services/api.js: VITE_API_URL is the origin, /api is appended", () => {
  assert.equal(apiBaseFromEnv("https://mittal-collections-api.onrender.com"), "https://mittal-collections-api.onrender.com/api");
  assert.equal(apiBaseFromEnv("http://localhost:5000/"), "http://localhost:5000/api");
  assert.equal(apiBaseFromEnv(undefined), "https://mittal-collections-api.onrender.com/api");
});
