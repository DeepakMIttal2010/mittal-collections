// Runs before `vite build` (see package.json's "build" script) and bakes
// the current banner coupon into src/data/bannerCouponSnapshot.json, which
// CouponBanner.jsx uses as its first-paint state when the visitor has no
// localStorage cache yet. Without it a first-time visitor (and every
// Lighthouse run) rendered no banner until GET /api/coupons/banner
// resolved, and the banner then appeared above the header and pushed the
// header, nav and hero down (42px desktop / 57px mobile, measured
// 2026-10-24) -- the homepage's largest layout shift.
//
// Same rules as fetch-hero-banners.mjs: retry a cold-starting API a few
// times, and on failure or a malformed body LEAVE THE EXISTING SNAPSHOT
// UNTOUCHED (last known good) rather than overwriting it. A response that
// positively says there is no banner coupon is valid and is written as
// {"coupon": null}. Only when there is no snapshot at all is a null one
// created, so the build's JSON import always resolves.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { parseBannerCouponResponse } from "../src/utils/bannerCoupon.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/bannerCouponSnapshot.json");
// VITE_API_URL is the API server's origin (services/api.js appends "/api"
// to it -- the production bundle's value has no "/api"), so the same is
// done here. fetch-hero-banners.mjs uses it as-is and so requests
// .../banners without /api.
export const apiBaseFromEnv = (value) =>
  `${(value || "https://mittal-collections-api.onrender.com").replace(/\/+$/, "")}/api`;
const API_BASE = apiBaseFromEnv(process.env.VITE_API_URL);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBannerCoupon(apiBase, fetchImpl) {
  const res = await fetchImpl(`${apiBase}/coupons/banner`);
  if (!res.ok) throw new Error(`API responded ${res.status} ${res.statusText}`);
  const parsed = parseBannerCouponResponse(await res.json());
  if (!parsed.ok) throw new Error("malformed /coupons/banner response");
  return parsed.coupon;
}

export async function snapshotBannerCoupon({
  apiBase = API_BASE,
  outPath = OUT_PATH,
  fetchImpl = fetch,
  attempts = 4,
  retryDelayMs = 15000,
  log = console,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const coupon = await fetchBannerCoupon(apiBase, fetchImpl);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify({ coupon }, null, 2) + "\n");
      log.log(`fetch-banner-coupon: snapshotted ${coupon ? coupon.code : "no banner coupon"} (attempt ${attempt})`);
      return { written: true, coupon };
    } catch (e) {
      log.warn(`fetch-banner-coupon: attempt ${attempt}/${attempts} failed (${e.message})`);
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }

  if (fs.existsSync(outPath)) {
    log.warn(`fetch-banner-coupon: all ${attempts} attempts failed -- keeping the existing snapshot.`);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ coupon: null }, null, 2) + "\n");
    log.warn(`fetch-banner-coupon: all ${attempts} attempts failed and no snapshot existed -- wrote an empty one.`);
  }
  return { written: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  snapshotBannerCoupon();
}
