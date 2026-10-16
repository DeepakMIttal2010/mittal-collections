// Runs before `vite build` (see package.json's "build" script) and bakes
// the current live banner list into a static JSON file that Hero.jsx
// imports as its initial state. Without this, a first-time visitor (and
// every Lighthouse/PageSpeed run, which always simulates one) sees the
// empty FALLBACK_SLIDE until client-side JS mounts and getBanners()
// resolves — the browser can't even discover the real hero image URL
// until that round-trip finishes, which a live audit measured as ~4.3s
// of pure "resource load delay" and is the dominant cause of this site's
// mobile LCP regularly landing at 5-8s (2026-10-05).
//
// Deliberately NOT a live server-side render — Hero.jsx's existing
// useEffect still re-fetches on every real page load and self-corrects
// (including the existing localStorage cache) if an admin has changed
// banners since the last deploy, so this snapshot only ever needs to be
// "close enough", not live-accurate.
//
// On any failure (network error, non-2xx response, or a malformed body)
// this LEAVES THE EXISTING COMMITTED SNAPSHOT FILE UNTOUCHED rather than
// overwriting it with an empty array. A first version of this script
// failed open to `[]` on error, which a 2026-10-05 regression audit
// caught: the backing API runs on Render's free tier, which cold-starts
// on an idle instance, so a Vercel production build landing during a
// cold start silently baked an empty snapshot into production — exactly
// the LCP regression this file exists to prevent, with no build failure
// or even a console warning to catch it. Retrying a few times with a
// delay (cold starts are commonly 30-50s) fixes most of those cases
// outright; keeping the last-known-good file on exhausted retries means
// a transient failure degrades to "yesterday's banners" instead of "no
// banners".
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/heroBannersSnapshot.json");
const API_BASE = process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com/api";
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBanners() {
  const res = await fetch(`${API_BASE}/banners`);
  if (!res.ok) {
    throw new Error(`API responded ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.banners)) {
    throw new Error(`Response had no "banners" array: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.banners;
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const banners = await fetchBanners();
      fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
      fs.writeFileSync(OUT_PATH, JSON.stringify(banners, null, 2) + "\n");
      console.log(`fetch-hero-banners: snapshotted ${banners.length} banner(s) from ${API_BASE} (attempt ${attempt})`);
      return;
    } catch (e) {
      console.warn(`fetch-hero-banners: attempt ${attempt}/${MAX_ATTEMPTS} failed (${e.message})`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  const hasExisting = fs.existsSync(OUT_PATH);
  console.warn(
    hasExisting
      ? `fetch-hero-banners: all ${MAX_ATTEMPTS} attempts failed — leaving the existing committed snapshot in place (NOT overwriting with empty data).`
      : `fetch-hero-banners: all ${MAX_ATTEMPTS} attempts failed and no existing snapshot file was found — Hero.jsx's FALLBACK_SLIDE will cover this build.`,
  );
}

main();
