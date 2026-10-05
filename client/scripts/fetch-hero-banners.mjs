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
// "close enough", not live-accurate. Failing open (writing an empty
// array) rather than failing the build if the API is briefly
// unreachable at build time — Hero.jsx's FALLBACK_SLIDE covers that
// case exactly as it already did before this existed.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/heroBannersSnapshot.json");
const API_BASE = process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com/api";

async function main() {
  let banners = [];
  try {
    const res = await fetch(`${API_BASE}/banners`);
    const data = await res.json();
    banners = Array.isArray(data.banners) ? data.banners : [];
    console.log(`fetch-hero-banners: snapshotted ${banners.length} banner(s) from ${API_BASE}`);
  } catch (e) {
    console.warn(`fetch-hero-banners: fetch failed (${e.message}), writing empty snapshot — Hero.jsx's FALLBACK_SLIDE covers this`);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(banners, null, 2) + "\n");
}

main();
