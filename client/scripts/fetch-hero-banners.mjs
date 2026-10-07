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
const INDEX_HTML_PATH = path.join(__dirname, "../index.html");
const API_BASE = process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com/api";
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Minimal, standalone copy of src/services/api.js's isCloudinaryUploadUrl +
// imgUrl/imgSrcSet Cloudinary-transform logic — not imported directly
// because this script runs as plain Node (not through Vite), and that
// file's top-level `import.meta.env.VITE_API_URL` read throws outside a
// Vite build. Same duplicate-rather-than-import convention render.js's
// own header comment already documents for this exact reason.
const isCloudinaryUploadUrl = (p) => {
  try {
    const u = new URL(p);
    return u.hostname === "res.cloudinary.com" && u.pathname.includes("/upload/");
  } catch {
    return false;
  }
};

const cloudinaryTransform = (p, transform) =>
  isCloudinaryUploadUrl(p) ? p.replace("/upload/", `/upload/${transform}/`) : p;

// The snapshot exists so a first-time visitor's browser can discover the
// hero image URL before JS executes (see the file header) — but nothing
// told the BROWSER to start fetching it that early. This closes that gap:
// inject a <link rel="preload" as="image"> for the first slide's image
// into index.html at build time, matching the exact src/srcset/sizes
// Hero.jsx itself requests (w_1000 main + 500/800/1200 srcset widths),
// so the real LCP request starts as soon as the HTML parses instead of
// waiting for main.jsx to download, parse, execute, and mount.
const PRELOAD_START = "<!-- hero-image-preload:start -->";
const PRELOAD_END = "<!-- hero-image-preload:end -->";

function buildPreloadTag(imageUrl) {
  if (!imageUrl) return "";
  const src = cloudinaryTransform(imageUrl, "w_1000,q_auto,f_webp");
  const srcset = isCloudinaryUploadUrl(imageUrl)
    ? [500, 800, 1200]
        .map((w) => `${cloudinaryTransform(imageUrl, `w_${w},q_auto,f_webp`)} ${w}w`)
        .join(", ")
    : "";
  return `${PRELOAD_START}
    <link
      rel="preload"
      as="image"
      href="${src}"
      ${srcset ? `imagesrcset="${srcset}"` : ""}
      imagesizes="(max-width: 640px) 90vw, (max-width: 1200px) 45vw, 512px"
      fetchpriority="high"
    />
    ${PRELOAD_END}`;
}

function updateIndexHtmlPreload(imageUrl) {
  const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  const tag = buildPreloadTag(imageUrl);
  const startIdx = html.indexOf(PRELOAD_START);
  const endIdx = html.indexOf(PRELOAD_END);

  let next;
  if (startIdx !== -1 && endIdx !== -1) {
    // Idempotent — replaces whatever a prior build injected rather than
    // stacking a new one on every run.
    next = html.slice(0, startIdx) + tag + html.slice(endIdx + PRELOAD_END.length);
  } else if (tag) {
    next = html.replace(
      '<link rel="preconnect" href="https://res.cloudinary.com" crossorigin />',
      (match) => `${match}\n    ${tag}`,
    );
  } else {
    return;
  }

  fs.writeFileSync(INDEX_HTML_PATH, next);
}

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
      updateIndexHtmlPreload(banners[0]?.image);
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
