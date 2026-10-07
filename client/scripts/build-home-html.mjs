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
// banner snapshot (fetch-hero-banners.mjs) and its <link rel="preload">
// companion both let the BROWSER discover/start fetching the real image
// before JS runs, but the actual <img> pixels still can't PAINT until
// React mounts -- on a slow device/connection, that JS parse+execute
// time is itself a real chunk of LCP. This closes that last gap: the
// exact same image is already painted in the raw HTML, before any JS
// has to run at all.
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

// Same standalone Cloudinary-transform logic as fetch-hero-banners.mjs's
// preload-link injection (and, ultimately, src/services/api.js's
// imgUrl/imgSrcSet) -- duplicated rather than imported for the same
// reason documented there: this runs as plain Node, not through Vite.
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

  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) {
    console.warn(`build-home-html: couldn't find ${JSON.stringify(marker)} in index.html -- writing home.html identical to index.html.`);
    fs.copyFileSync(INDEX_PATH, HOME_PATH);
    return;
  }

  const next = html.replace(marker, `${snippet}\n    ${marker}`);
  fs.writeFileSync(HOME_PATH, next);
  console.log("build-home-html: wrote dist/home.html with a pre-painted hero placeholder.");
}

main();
