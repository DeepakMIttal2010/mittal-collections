// Runs before `vite build` (see package.json's "build" script) and bakes
// the current category list into src/data/navCategoriesSnapshot.json,
// which MegaMenu.jsx uses as its first-render state. Without it the
// desktop nav rendered no categories until GET /api/categories resolved,
// then inserted them between "Home" and the static links, pushing
// Clearance Sale/Top Trending/New Arrivals/Gifting/Guides ~566px right on
// every desktop page load (CLS 0.0236 at 1366x768, measured 2026-10-25).
//
// Same rules as fetch-hero-banners.mjs / fetch-banner-coupon.mjs: retry a
// cold-starting API a few times, and on failure or a malformed body LEAVE
// THE EXISTING SNAPSHOT UNTOUCHED (last known good). Only when there is no
// snapshot at all is an empty one created, so the build's JSON import
// always resolves. Subcategories aren't snapshotted -- they only fill the
// hover/focus dropdown panels, which don't affect the nav row's layout.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { parseNavCategoriesResponse } from "../src/utils/navCategories.js";
import { apiBaseFromEnv } from "./apiBase.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/navCategoriesSnapshot.json");
const API_BASE = apiBaseFromEnv(process.env.VITE_API_URL);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchNavCategories(apiBase, fetchImpl) {
  const res = await fetchImpl(`${apiBase}/categories`);
  if (!res.ok) throw new Error(`API responded ${res.status} ${res.statusText}`);
  const categories = parseNavCategoriesResponse(await res.json());
  if (!categories) throw new Error("malformed /categories response");
  return categories;
}

export async function snapshotNavCategories({
  apiBase = API_BASE,
  outPath = OUT_PATH,
  fetchImpl = fetch,
  attempts = 4,
  retryDelayMs = 15000,
  log = console,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const categories = await fetchNavCategories(apiBase, fetchImpl);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(categories, null, 2) + "\n");
      log.log(`fetch-nav-categories: snapshotted ${categories.length} categories (attempt ${attempt})`);
      return { written: true, count: categories.length };
    } catch (e) {
      log.warn(`fetch-nav-categories: attempt ${attempt}/${attempts} failed (${e.message})`);
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }

  if (fs.existsSync(outPath)) {
    log.warn(`fetch-nav-categories: all ${attempts} attempts failed -- keeping the existing snapshot.`);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, "[]\n");
    log.warn(`fetch-nav-categories: all ${attempts} attempts failed and no snapshot existed -- wrote an empty one.`);
  }
  return { written: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  snapshotNavCategories();
}
