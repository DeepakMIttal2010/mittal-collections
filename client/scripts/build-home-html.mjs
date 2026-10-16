// Post-build step (runs after `vite build`, see package.json's "build"
// script) — creates dist/home.html, a copy of the built index.html with
// a static, pre-painted hero <img> injected as a SIBLING of #root (not
// inside it).
//
// Why a sibling, not inside #root: React's createRoot(#root).render()
// does NOT clear pre-existing children of its container before its first
// commit -- it only knows how to reconcile against its own previously
// rendered tree, which starts empty. Content placed directly inside
// #root would therefore survive mounting as orphaned, duplicate markup
// sitting next to (not replaced by) the real client-rendered Hero.
// Putting it beside #root instead means React's root never sees it, so
// there's no reconciliation risk at all -- cleanup is a plain DOM
// removal, done once by Hero.jsx itself on mount (see its
// useLayoutEffect), synchronously before the browser's next paint.
//
// Why this exists: Hero.jsx is the page's LCP element. The build-time
// banner snapshot (fetch-hero-banners.mjs) lets the browser discover the
// real image URL without waiting on a client-side fetch, and the <link
// rel="preload"> this file ALSO injects below lets it start fetching
// that image immediately -- but the actual <img> pixels still can't
// PAINT until React mounts, and on a slow device/connection that JS
// parse+execute time is itself a real chunk of LCP. The sibling <img>
// below closes that last gap: the exact same image is already painted
// in the raw HTML, before any JS has to run at all.
//
// The preload <link> used to live as a permanent, build-time-baked tag
// in the SHARED index.html (every route, not just "/") -- meaning every
// product/category/article page's highest-priority image fetch was
// spent on the homepage's own banner photo, which that page never even
// displays (found live via DevTools on a product page, 2026-10-17: the
// preloaded URL and the page's real main image were two unrelated
// files). Moved here specifically because this file already only ever
// targets the one route (home.html) this optimization is actually
// correct for.
//
// Only ever served to the exact "/" path (see middleware.js, which
// rewrites non-bot "/" requests here -- Vercel serves a static index.html
// straight from disk for an exact "/" request, bypassing vercel.json's
// `rewrites` entirely, which is why this has to be a real second static
// file rather than a vercel.json rewrite rule). Every other route keeps
// using the normal index.html untouched.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "../dist");
const INDEX_PATH = path.join(DIST_DIR, "index.html");
const HOME_PATH = path.join(DIST_DIR, "home.html");
const SNAPSHOT_PATH = path.join(__dirname, "../src/data/heroBannersSnapshot.json");

// Same standalone Cloudinary-transform logic render.js's own copy uses
// (and, ultimately, src/services/api.js's imgUrl/imgSrcSet) -- duplicated
// rather than imported for the same reason documented there: this runs
// as plain Node, not through Vite.
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

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function buildHeroSnippet(imageUrl) {
  if (!imageUrl) return "";

  const src = cloudinaryTransform(imageUrl, "w_1000,q_auto,f_webp");
  const srcset = isCloudinaryUploadUrl(imageUrl)
    ? [500, 800, 1200]
        .map((w) => `${cloudinaryTransform(imageUrl, `w_${w},q_auto,f_webp`)} ${w}w`)
        .join(", ")
    : "";

  // Same classNames Hero.css already styles (hero / container hero-split
  // / hero-split-media / hero-split-image) -- no new CSS needed, and the
  // reserved aspect-ratio/min-height on those classes means this costs
  // nothing in CLS whether or not the rest of the hero content (text
  // column, arrows/dots) has mounted yet.
  return `<section class="hero" id="hero-ssr-placeholder" aria-hidden="true">
      <div class="container hero-split">
        <div class="hero-split-media">
          <img
            src="${escapeHtml(src)}"
            ${srcset ? `srcset="${escapeHtml(srcset)}"` : ""}
            sizes="(max-width: 640px) 90vw, (max-width: 1200px) 45vw, 512px"
            alt=""
            class="hero-split-image"
            fetchpriority="high"
          />
        </div>
      </div>
    </section>`;
}

// Matches the exact src/srcset/sizes buildHeroSnippet's sibling <img>
// above requests, so the preload and the actual paint request resolve
// to the identical URL (a browser cache hit, not two separate
// downloads of the same photo) -- same "must match exactly" reasoning
// as render.js's own prepaint/real-component pairing for product and
// category pages.
function buildPreloadLinkTag(imageUrl) {
  if (!imageUrl) return "";

  const src = cloudinaryTransform(imageUrl, "w_1000,q_auto,f_webp");
  const srcset = isCloudinaryUploadUrl(imageUrl)
    ? [500, 800, 1200]
        .map((w) => `${cloudinaryTransform(imageUrl, `w_${w},q_auto,f_webp`)} ${w}w`)
        .join(", ")
    : "";

  return `<link
      rel="preload"
      as="image"
      href="${escapeHtml(src)}"
      ${srcset ? `imagesrcset="${escapeHtml(srcset)}"` : ""}
      imagesizes="(max-width: 640px) 90vw, (max-width: 1200px) 45vw, 512px"
      fetchpriority="high"
    />`;
}

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.warn("build-home-html: dist/index.html not found -- did `vite build` run first? Skipping.");
    return;
  }

  let imageUrl = null;
  try {
    const banners = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    imageUrl = Array.isArray(banners) && banners[0]?.image;
  } catch {
    // No snapshot (e.g. every fetch-hero-banners.mjs attempt failed and
    // no committed file existed either) -- home.html just won't get a
    // placeholder, same as a visitor who'd otherwise see the bundled
    // FALLBACK_SLIDE. Not worth failing the build over.
  }

  const snippet = buildHeroSnippet(imageUrl);
  if (!snippet) {
    console.warn("build-home-html: no hero image available -- writing home.html identical to index.html.");
    fs.copyFileSync(INDEX_PATH, HOME_PATH);
    return;
  }

  // index.html carries a comment explaining why it has NO hero-image
  // preload (see its own "index-html-only-comment" markers) -- true for
  // every route except this one, so it'd read as self-contradictory
  // sitting right above the preload tag this file is about to inject.
  const rawHtml = fs.readFileSync(INDEX_PATH, "utf8");
  const html = rawHtml.replace(
    /\s*<!-- index-html-only-comment:start -->[\s\S]*?<!-- index-html-only-comment:end -->/,
    "",
  );
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) {
    console.warn(`build-home-html: couldn't find ${JSON.stringify(marker)} in index.html -- writing home.html identical to index.html.`);
    fs.copyFileSync(INDEX_PATH, HOME_PATH);
    return;
  }

  let next = html.replace(marker, `${snippet}\n    ${marker}`);

  const preloadTag = buildPreloadLinkTag(imageUrl);
  if (preloadTag) {
    const preconnectTag = '<link rel="preconnect" href="https://res.cloudinary.com" crossorigin />';
    if (next.includes(preconnectTag)) {
      next = next.replace(preconnectTag, `${preconnectTag}\n    ${preloadTag}`);
    }
  }

  fs.writeFileSync(HOME_PATH, next);
  console.log("build-home-html: wrote dist/home.html with a pre-painted hero placeholder.");
}

main();
