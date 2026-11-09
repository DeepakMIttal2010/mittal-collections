// Guest welcome popup timing (src/utils/welcomePopupTrigger.js +
// components/WelcomeBenefitsPopup.jsx): opens after 25s on the site or at
// 50% scroll, whichever comes first (was 2.5s after load), and still at
// most once every 24 hours.
//   node --test scripts/welcome-popup-trigger.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  WELCOME_DELAY_MS,
  WELCOME_SCROLL_FRACTION,
  WELCOME_SUPPRESS_MS,
  scrolledFarEnough,
  welcomeRecentlyShown,
} from "../src/utils/welcomePopupTrigger.js";

const src = fs.readFileSync(new URL("../src/components/WelcomeBenefitsPopup.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("timing constants: 25 seconds, half the page", () => {
  assert.equal(WELCOME_DELAY_MS, 25000);
  assert.equal(WELCOME_SCROLL_FRACTION, 0.5);
});

test("scroll trigger at 50% of the scrollable height, never on a page that can't scroll", () => {
  // 10,000px page, 800px viewport -> 9,200px scrollable.
  assert.equal(scrolledFarEnough(0, 10000, 800), false);
  assert.equal(scrolledFarEnough(4599, 10000, 800), false);
  assert.equal(scrolledFarEnough(4600, 10000, 800), true);
  assert.equal(scrolledFarEnough(9200, 10000, 800), true);
  assert.equal(scrolledFarEnough(0, 800, 800), false);
  assert.equal(scrolledFarEnough(0, 600, 800), false);
});

test("24-hour suppression: not again within 24h, again after it", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const H = 60 * 60 * 1000;
  assert.equal(WELCOME_SUPPRESS_MS, 24 * H);
  assert.equal(welcomeRecentlyShown(null, now), false);
  assert.equal(welcomeRecentlyShown("", now), false);
  assert.equal(welcomeRecentlyShown(String(now), now), true);
  assert.equal(welcomeRecentlyShown(String(now - 23 * H), now), true);
  assert.equal(welcomeRecentlyShown(String(now - 24 * H + 1), now), true);
  assert.equal(welcomeRecentlyShown(String(now - 24 * H), now), false);
  assert.equal(welcomeRecentlyShown(String(now - 3 * 24 * H), now), false);
  assert.equal(welcomeRecentlyShown("garbage", now), false);
});

test("component: timer OR scroll, shown once, listeners cleaned up; other behaviour unchanged", () => {
  assert.doesNotMatch(src, /SHOW_AFTER_MS|SUPPRESS_MS|2500/);
  assert.match(src, /if \(welcomeRecentlyShown\(localStorage\.getItem\(SHOWN_KEY\)\)\) return;/);
  assert.match(src, /const timer = setTimeout\(show, WELCOME_DELAY_MS\);/);
  assert.match(src, /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\);/);
  assert.match(src, /clearTimeout\(timer\);\s*window\.removeEventListener\("scroll", onScroll\);/);
  assert.match(src, /if \(shown\) return;\s*shown = true;/);
  // Guests only; preview + post-registration celebration + auto-close + coupon unchanged.
  assert.match(src, /if \(isLoggedIn \|\| !enabled\) return;/);
  assert.match(src, /if \(previewMode\) \{\s*setVisible\(true\);\s*return;\s*\}/);
  assert.match(src, /if \(!justRegistered\) return;\s*setCelebrateMode\(true\);\s*setVisible\(true\);/);
  assert.match(src, /const AUTO_CLOSE_MS = 5000;/);
  assert.match(src, /getBannerCoupon\(\)\.then/);
});
