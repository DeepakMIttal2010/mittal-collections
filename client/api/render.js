// Serves crawlers (Googlebot, WhatsApp, Facebook, Twitter, etc.) a version
// of index.html with the real product/category/article/homepage title,
// description, OG tags and JSON-LD already in place — this is a
// client-side-rendered SPA, so the plain HTML response every bot sees by
// default is just the generic site shell, which is what was showing up in
// Search Console snippets and WhatsApp/Facebook link previews instead of
// the actual page.
//
// Routed here only for known bot user-agents (see vercel.json `has`
// rules) for every page type EXCEPT product pages, which route every
// visitor here — bot or real browser alike (2026-10-16, for LCP: see
// buildProductPrepaintHtml/getProductById's own comments). This
// function's own isBot check (BOT_USER_AGENT_RE, inside the handler)
// is what actually tells the two apart now that vercel.json's routing
// layer no longer always does.

const SITE_NAME = "Mittal Collections";
const SITE_URL = "https://www.mittalcollections.com";
const API_BASE =
  process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com";
// The homepage hero banner, cropped to the 1200x630 link-preview size —
// mirrors client/src/components/Seo.jsx's own DEFAULT_IMAGE (same asset,
// same reasoning: keep the two in sync since this file is the client-side
// component's server-rendered-for-bots counterpart).
const DEFAULT_IMAGE =
  "https://res.cloudinary.com/y2gghpvz/image/upload/w_1200,h_630,c_fill,g_auto,q_auto,f_auto/v1788778399/mittal-collections/b7qfxz8qsnqigmpttuyb.jpg";

// Mirrors client/src/utils/deliveryAreas.js — duplicated rather than
// imported since this file avoids pulling in anything from src/ (see
// this file's other constants above, all duplicated the same way).
// Keep both copies in sync.
const DELIVERY_AREAS = [
  "Vasundhara",
  "Vaishali",
  "Indirapuram",
  "Kaushambi",
  "Sahibabad",
  "Mohan Nagar",
  "Rajendra Nagar",
  "Lajpat Nagar",
  "Suryanagar",
  "Brij Vihar",
];

// Mirrors client/src/utils/localBusinessJsonLd.js exactly (same
// duplication reasoning as DELIVERY_AREAS above) — the homepage,
// /contact and /ghaziabad-home-furnishing-store STATIC_PAGES branches
// below each used to build their own one-off HomeGoodsStore object,
// which had drifted into three different, non-overlapping property
// sets (priceRange only on the homepage's, email only on /contact's,
// postalCode only on the Ghaziabad one) for what Google reads as ONE
// business entity (same "@id" on all three). Keep both copies of this
// function in sync.
const SUPPORT_HOURS_DAY_MAP = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const parseSupportHours = (supportHours) => {
  if (!supportHours) return undefined;

  const match = supportHours
    .trim()
    .match(
      /^(\w{3})\s*-\s*(\w{3}):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i,
    );

  if (!match) return undefined;

  const [, fromDay, toDay, opens, closes] = match;
  const dayKeys = Object.keys(SUPPORT_HOURS_DAY_MAP);
  const fromIndex = dayKeys.indexOf(fromDay.toLowerCase());
  const toIndex = dayKeys.indexOf(toDay.toLowerCase());

  if (fromIndex === -1 || toIndex === -1 || toIndex < fromIndex) return undefined;

  const dayOfWeek = Object.values(SUPPORT_HOURS_DAY_MAP).slice(
    fromIndex,
    toIndex + 1,
  );

  return { "@type": "OpeningHoursSpecification", dayOfWeek, opens, closes };
};

const buildLocalBusinessJsonLd = (
  settings,
  { streetAddress, postalCode, includeAreaServed = false } = {},
) => {
  const address = streetAddress || settings.address;
  if (!address) return null;

  const openingHoursSpecification = parseSupportHours(settings.supportHours);

  return {
    "@context": "https://schema.org",
    "@type": "HomeGoodsStore",
    "@id": `${SITE_URL}/#business`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    telephone: settings.phone || undefined,
    email: settings.email || undefined,
    priceRange: "₹₹",
    // Google's Rich Results Test flags this as a missing optional field
    // on the LocalBusiness item — reusing the same hero-banner crop
    // every other image/og:image on the site already falls back to,
    // rather than adding a new asset (2026-10-14).
    image: DEFAULT_IMAGE,
    ...(openingHoursSpecification && { openingHoursSpecification }),
    address: {
      "@type": "PostalAddress",
      streetAddress: address,
      addressLocality: "Ghaziabad",
      addressRegion: "Uttar Pradesh",
      addressCountry: "IN",
      ...(postalCode && { postalCode }),
    },
    ...(includeAreaServed && {
      areaServed: [
        ...DELIVERY_AREAS.map((area) => ({
          "@type": "Place",
          name: `${area}, Ghaziabad`,
        })),
        { "@type": "City", name: "Ghaziabad" },
      ],
    }),
    sameAs: [
      settings.facebook,
      settings.instagram,
      settings.twitter,
      settings.linkedin,
    ].filter(Boolean),
  };
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Mirrors Seo.jsx's own `fullTitle` logic exactly -- some STATIC_PAGES
// entries' `title` doubles as the visible <h1>/body heading text (see
// buildSimpleBodyHtml/buildArticleListBodyHtml/the /contact handler
// below), so the brand suffix is appended here, only at the actual
// <title>-tag consumption points, rather than baked into the shared
// string itself (which would leak "| Mittal Collections" into those
// headings too -- confirmed 9 of these entries were missing the
// suffix in the live <title> tag, a real mismatch against what a real
// visitor's browser tab shows for the same URL, 2026-10-19 audit).
const withBrandSuffix = (title) =>
  title && !title.includes(SITE_NAME) ? `${title} | ${SITE_NAME}` : title || SITE_NAME;

// Mirrors client/src/utils/truncateMetaDescription.js exactly -- a
// plain `.slice(0, 160)` cuts mid-word on this catalog's real
// description lengths roughly 2 out of 3 times (confirmed via a
// live-DOM audit, 2026-10-19), and this is the version Google actually
// indexes (bots get this file's output, not the client-rendered one).
function truncateAtWordBoundary(text, maxLength = 160) {
  if (!text || text.length <= maxLength) return text || "";
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return safe.replace(/[\s,.;:—-]+$/, "");
}

// Mirrors client/src/components/Seo.jsx's safeJsonLdStringify exactly —
// see that file's comment for why plain JSON.stringify is unsafe here:
// a review's content (productJsonLd.review[].reviewBody, sourced from
// live customer reviews) can contain a literal "</script><script>"
// sequence that closes this tag early and opens a real one, regardless
// of JSON quoting. This is the bot-facing prerender path (Googlebot,
// WhatsApp/Facebook crawlers) so it needs its own copy, not just the
// client-side one.
const safeJsonLdStringify = (block) =>
  JSON.stringify(block).replace(/</g, "\\u003c");

// A slow/cold Render backend previously had no way to fail fast here —
// a plain `fetch()` with no timeout just hangs until Vercel's own
// function-duration limit kills it, wasting the whole budget instead of
// hitting the "fail open to plain shell" catch in the handler below
// quickly. 6s leaves headroom under Vercel's default limits while still
// being generous for a Render free/starter-tier cold start.
const fetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  return res.json();
};

// For a fetch whose data is genuinely non-essential to the page (reviews,
// Q&A, the rewards teaser) -- every caller already has a `.success ?  ...
// : fallback` branch for the case where the API itself returns
// `{success:false}`, but that branch was unreachable for the MORE common
// real-world failure (a timeout, a network blip, non-JSON output), since
// those make fetchJson's promise REJECT rather than resolve. Sitting
// inside the same `Promise.all` as the page's actual primary data (the
// product/category/homepage content), one flaky secondary fetch rejecting
// took the whole batch down with it, degrading a perfectly fine page to
// the generic fail-open shell. This never throws -- same `{success:
// false}` shape every caller already handles.
const safeFetchJson = async (url) => {
  try {
    return await fetchJson(url);
  } catch (error) {
    console.error(`safeFetchJson failed for ${url}:`, error.message);
    return { success: false };
  }
};

// Mirrors client/src/utils/stripHtml.js's intent (plain text for a meta
// description / JSON-LD description, not markup) but can't reuse that
// file as-is -- it goes through DOMPurify and a real `document`, neither
// of which exist in this serverless function's Node runtime. Loops the
// tag-strip to convergence rather than a single regex pass, for the same
// reason stripHtml.js avoids a single-pass regex (CodeQL: "incomplete
// multi-character sanitization" -- e.g. "<scr<script>ipt>" would
// otherwise reform "<script>" after only one pass).
const stripHtml = (html) => {
  let text = String(html || "")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "</$1> ")
    .replace(/<br\s*\/?>/gi, " ");

  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== previous);

  // &amp; must decode LAST -- decoding it first would double-unescape a
  // literal "&amp;lt;" (an escaped ampersand followed by literal "lt;")
  // into an actual "<" instead of leaving it as the text "&lt;" (CodeQL:
  // "double escaping or unescaping").
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
};

// Mirrors client/src/utils/shipping.js — duplicated for the same reason
// DELIVERY_AREAS above is (this file avoids importing anything from
// src/). Keep both copies in sync.
const calculateDeliveryFee = (subtotal, settings) => {
  const threshold = settings?.freeShippingThreshold ?? 499;

  if (subtotal >= threshold) return 0;

  const tiers = [...(settings?.shippingTiers || [])].sort(
    (a, b) => a.maxOrderValue - b.maxOrderValue,
  );

  const matchedTier = tiers.find((tier) => subtotal < tier.maxOrderValue);

  return matchedTier ? matchedTier.fee : (settings?.deliveryFee ?? 49);
};

const imgUrl = (path) => {
  if (!path) return path;
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
};

// Same standalone Cloudinary-transform helpers as
// scripts/build-home-html.mjs's hero-snippet builder (duplicated rather
// than imported for the same reason documented there: that script runs
// as plain Node outside Vite, and this file is a separate Vercel
// serverless function — neither shares a bundle with client/src).
const isCloudinaryUploadUrl = (p) => {
  try {
    const u = new URL(p);
    return u.hostname === "res.cloudinary.com" && u.pathname.includes("/upload/");
  } catch {
    return false;
  }
};

// Mirrors client/src/services/api.js's imgUrl EXACTLY, including its
// f_auto -> f_webp rewrite (that file's own comment explains why: f_auto
// content-negotiation wasn't reliably varying by Accept at Vercel's edge
// cache, confirmed live in Deep SEO Round 6). A prepaint image must
// resolve to the IDENTICAL URL the real component requests once it
// mounts, or the browser treats them as two different resources and
// downloads the same photo twice instead of reusing the prepaint's
// already-in-flight/cached request -- found and fixed here, 2026-10-16,
// after the product-page prepaint shipped with a literal "f_auto" that
// never got this rewrite.
const cloudinaryTransform = (p, transform) => {
  if (!isCloudinaryUploadUrl(p)) return p;

  let resolved = transform.replace(/f_auto\b/, "f_webp");

  // Mirrors client/src/services/api.js's imgUrl c_limit fix exactly (see
  // that file's comment) -- without this, a smaller-than-requested source
  // photo gets upscaled and shipped blurry. Keeping both in sync matters
  // doubly here: a prepaint URL that doesn't match what the real
  // component requests once it mounts makes the browser download the
  // same photo twice instead of reusing the prepaint's request.
  if (/\bw_\d+/.test(resolved) && !/\bc_/.test(resolved)) {
    resolved = resolved.replace(/\bw_\d+/, (w) => `c_limit,${w}`);
  }

  return p.replace("/upload/", `/upload/${resolved}/`);
};

// A plain DOM sibling of #root (same "never place inside #root" rule
// scripts/build-home-html.mjs's own header comment explains in full --
// client/src/main.jsx uses createRoot().render(), not hydrateRoot(), so
// anything placed INSIDE #root survives mounting as orphaned, duplicate
// markup instead of being reconciled away). ProductDetails.jsx's own
// useLayoutEffect removes `#product-ssr-placeholder` synchronously
// before the browser's next paint -- a no-op once this is already gone.
// Deliberately only reproduces the single image block (the actual LCP
// element), using the exact Tailwind classes ProductDetails.jsx's own
// gallery container already uses (compiled CSS loads before body
// content either way, so these are already styled) -- not the full
// gallery/thumbnails/zoom UI, which would mean hand-maintaining a
// second copy of a page that changes far more often than the simple,
// stable homepage hero this same pattern was first built for.
function buildProductPrepaintHtml(mainImage) {
  if (!mainImage) return "";

  const src = cloudinaryTransform(mainImage, "w_1600,q_auto,f_auto");
  const srcset = isCloudinaryUploadUrl(mainImage)
    ? [400, 800, 1200, 1600]
        .map((w) => `${cloudinaryTransform(mainImage, `w_${w},q_auto,f_auto`)} ${w}w`)
        .join(", ")
    : "";

  return `<div id="product-ssr-placeholder" class="w-full min-w-0 max-w-6xl mx-auto px-4 py-12" aria-hidden="true">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div class="min-w-0">
          <div class="relative overflow-hidden rounded-xl border border-slate-200 bg-white aspect-square">
            <img
              src="${escapeHtml(src)}"
              ${srcset ? `srcset="${escapeHtml(srcset)}"` : ""}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt=""
              fetchpriority="high"
              class="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>`;
}

// Same reconciliation-safe sibling-of-#root technique as
// buildProductPrepaintHtml above -- CategoryPage.jsx's own
// useLayoutEffect removes `#category-ssr-placeholder` on mount. Only
// reproduces the product-image GRID (the actual LCP element on a
// listing page, same conclusion ProductGrid.jsx's own `priority` prop
// comment reaches), using ProductGrid.css/ProductCard.css's real class
// names (.product-grid/.product-card/.product-image) -- unlike
// ProductDetails' Tailwind-based layout, this grid's CSS is bespoke,
// but it's loaded in the same blocking stylesheet either way, so reusing
// the real classes works the same way. Wraps it in the same
// `lg:flex lg:gap-8` + hidden-below-lg `<aside>` CategoryPage.jsx uses,
// so desktop reserves the sidebar's width instead of the grid jumping
// sideways once the real page mounts -- on mobile (where this fix
// actually matters most, per the Lighthouse numbers that motivated it)
// that `<aside>` is `hidden` and takes no space, so the grid is already
// full-width exactly like the real one will be.
// Mirrors CategoryPage.jsx's sortProducts() default case exactly -- same
// two sequential STABLE sorts (JS Array.sort is stable, ES2019+), not a
// single combined comparator, so the tie-breaking behavior (in-stock is
// the effective primary key once both passes run; featured is the
// secondary key, inherited from the first pass; original array order is
// the final tie-breaker) matches byte-for-byte rather than approximating
// it. Needed because a visitor's actual first paint always starts at
// sortBy="featured" (CategoryPage.jsx's useState initial value, no URL
// param overrides it) -- the prepaint was previously taking products in
// raw API order instead, so the 4 cards it painted could be a visibly
// DIFFERENT set/order than the real page's first 4 (confirmed live,
// 2026-10-17, curtains/satin: prepaint showed Champagne/Teal/Navy/Purple,
// the real sorted page shows Navy/Purple/Red/Champagne -- Teal and Red
// swap into/out of the visible set entirely, not just reordered).
function sortProductsLikeDefaultView(products) {
  const sorted = [...products];
  sorted.sort((a, b) => (b.featured === true) - (a.featured === true));
  sorted.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));
  return sorted;
}

function buildCategoryPrepaintHtml(products) {
  const priorityProducts = sortProductsLikeDefaultView(products)
    .slice(0, 4)
    .filter((p) => p.image);
  if (priorityProducts.length === 0) return "";

  const cards = priorityProducts
    .map((p, i) => {
      const src = cloudinaryTransform(imgUrl(p.image), "w_400,q_auto,f_auto");
      const srcset = isCloudinaryUploadUrl(imgUrl(p.image))
        ? [200, 400, 600]
            .map((w) => `${cloudinaryTransform(imgUrl(p.image), `w_${w},q_auto,f_auto`)} ${w}w`)
            .join(", ")
        : "";
      return `<div class="product-card">
        <div class="product-image">
          <img
            src="${escapeHtml(src)}"
            ${srcset ? `srcset="${escapeHtml(srcset)}"` : ""}
            sizes="(min-width: 1024px) 270px, (min-width: 768px) 29vw, 45vw"
            alt=""
            ${i === 0 ? 'fetchpriority="high"' : ""}
            class="w-full h-full object-cover"
          />
        </div>
      </div>`;
    })
    .join("\n");

  return `<div id="category-ssr-placeholder" class="max-w-7xl mx-auto px-4 py-8" aria-hidden="true">
      <div class="lg:flex lg:gap-8 lg:items-start">
        <aside class="hidden lg:block w-64 shrink-0"></aside>
        <div class="flex-1 min-w-0">
          <div class="product-grid">
            ${cards}
          </div>
        </div>
      </div>
    </div>`;
}

// Shared by every buildXBodyHtml helper below — a real <nav> a crawler's
// non-JS first pass can read, not just the JSON-LD BreadcrumbList
// (buildBreadcrumbJsonLd) which only ever lived in <head> as structured
// data, never as visible text.
const buildBreadcrumbHtml = (breadcrumbItems) =>
  breadcrumbItems
    .map((item) =>
      item.path
        ? `<a href="${escapeHtml(`${SITE_URL}${item.path}`)}">${escapeHtml(item.name)}</a>`
        : `<span>${escapeHtml(item.name)}</span>`,
    )
    .join(" &gt; ");

// Real, visible HTML for a product page's <body> — same reasoning as
// buildCategoryBodyHtml below (added first, for category pages, after a
// confirmed live Soft 404 on table-covers; extended here to product
// pages since those matter even more for long-tail search — most of the
// 1,000+ products this catalog is working toward are reached through a
// product page, not a category page). Specs list only includes fields
// that are actually set, since most products don't use every one
// (variant products have no flat size/color, for instance).
const buildProductBodyHtml = (
  product,
  plainDescription,
  offerPrice,
  offerStock,
  breadcrumbItems,
  galleryImages,
  isHindi = false,
  relatedProducts = [],
) => {
  const breadcrumbHtml = buildBreadcrumbHtml(breadcrumbItems);
  const displayName = isHindi ? product.nameHi : product.name;

  const specs = isHindi
    ? [
        ["ब्रांड", product.brandHi || product.brand],
        ["फैब्रिक", product.fabricHi || product.fabric],
        ["रंग", product.color],
        ["पैटर्न", product.pattern],
        ["साइज़", localizeSizeHi(product.size)],
      ].filter(([, value]) => value)
    : [
        ["Brand", product.brand],
        ["Fabric", product.fabric],
        ["Color", product.color],
        ["Pattern", product.pattern],
        ["Size", product.size],
      ].filter(([, value]) => value);

  const specsHtml = specs
    .map(([label, value]) => `<li>${escapeHtml(label)}: ${escapeHtml(value)}</li>`)
    .join("\n");

  // Per-photo alt text, matching ProductDetails.jsx's client-rendered
  // version (`${name} - photo ${i+1}`) -- every gallery image used to
  // get the identical alt string here, diluting per-image indexing
  // signal across a multi-photo product's entire gallery.
  const imagesHtml = galleryImages
    .map(
      (url, i) =>
        `<img src="${escapeHtml(url)}" alt="${escapeHtml(displayName)} - photo ${i + 1}" />`,
    )
    .join("\n");

  // Same card markup as buildCategoryBodyHtml's productsHtml -- a
  // product page was otherwise a dead end beyond one breadcrumb link
  // for a non-JS crawler, despite ProductDetails.jsx already building
  // this exact related-products list client-side (SEO/conversion
  // audit, 2026-10-20).
  const relatedProductsHtml = relatedProducts
    .map((rp) => {
      const slug = rp.slug || "";
      const productPath = slug ? `/product/${rp._id}/${slug}` : `/product/${rp._id}`;
      const href = `${SITE_URL}${isHindi && rp.nameHi ? `/hi${productPath}` : productPath}`;
      const relatedDisplayName = isHindi && rp.nameHi ? rp.nameHi : rp.name;
      const relatedImg = imgUrl(rp.image);

      return `<li>
        <a href="${escapeHtml(href)}">
          ${relatedImg ? `<img src="${escapeHtml(relatedImg)}" alt="${escapeHtml(relatedDisplayName)}" />` : ""}
          <span>${escapeHtml(relatedDisplayName)}</span>
          <span>₹${escapeHtml(rp.price)}</span>
        </a>
      </li>`;
    })
    .join("\n");

  return `
    <nav aria-label="breadcrumb">${breadcrumbHtml}</nav>
    <h1>${escapeHtml(displayName)}</h1>
    ${imagesHtml}
    <p>₹${escapeHtml(offerPrice)} — ${offerStock > 0 ? (isHindi ? "उपलब्ध" : "In Stock") : isHindi ? "स्टॉक में नहीं" : "Out of Stock"}</p>
    ${specs.length > 0 ? `<ul>${specsHtml}</ul>` : ""}
    ${plainDescription ? `<p>${escapeHtml(plainDescription)}</p>` : ""}
    ${
      relatedProductsHtml
        ? `<nav aria-label="${isHindi ? "संबंधित उत्पाद" : "Related products"}">
      <h2>${isHindi ? "संबंधित उत्पाद" : "Related Products"}</h2>
      <ul>
        ${relatedProductsHtml}
      </ul>
    </nav>`
        : ""
    }
  `;
};

// Real, visible HTML for the page <body> — not just the <head> meta tags
// and JSON-LD injectMeta() below already handles. Confirmed live
// (2026-10-02): every bot-served page's body was a bare
// `<div id="root"></div>` (the real product grid only ever renders
// client-side, which this prerender path deliberately bypasses for
// bots) — and /category/table-covers came back from Search Console's
// URL Inspection as "Soft 404" despite having 26 real products and full
// JSON-LD, because a body with no distinguishing text is indistinguishable
// from a genuinely-empty/removed page to that classifier. This gives
// Googlebot's first-pass (non-JS) crawl the same product list a real
// visitor's browser renders, not just a head-only shell.
// Duplicated from client/src/pages/CategoryPage.jsx's getSizeHelpLinks()
// rather than imported (same reason as this file's other standalone
// data/helper duplicates -- this is a separate serverless function, not
// part of the client bundle). That client-side map already links each
// category to its matching guide article for real human visitors, but
// bots never ran the JS that renders it -- a category page was a dead
// end with no path to the content Mittal Collections had already
// written for it (SEO/conversion audit, 2026-10-20).
const CATEGORY_GUIDE_LINKS = {
  bedsheets: [
    {
      path: "/articles/bedsheet-size-guide-which-size-fits-single-double-queen-king-beds",
      label: "Size Guide",
      labelHi: "साइज़ गाइड",
    },
  ],
  // Missed when this map was first built -- CategoryPage.jsx's own
  // getSizeHelpLinks() links curtains to the interactive size
  // calculator (not an article, unlike every other category here), so
  // this category's guide link was never ported into the bot-facing
  // map at all, leaving the curtains category page with zero guide
  // link for a non-JS crawler (found live, 2026-10-20 verification
  // pass -- the other 10 categories in this map were all confirmed
  // working, this one entry was simply never added).
  curtains: [
    {
      path: "/curtain-size-calculator",
      label: "Size Calculator",
      labelHi: "साइज़ कैलकुलेटर",
    },
  ],
  doormats: [
    {
      path: "/articles/doormat-size-guide-which-size-for-entrance-bedroom-bathroom-kitchen",
      label: "Size Guide",
      labelHi: "साइज़ गाइड",
    },
    {
      path: "/articles/how-to-choose-the-right-doormat",
      label: "Buying Guide",
      labelHi: "खरीद गाइड",
    },
  ],
  towels: [
    {
      path: "/articles/towel-size-guide-which-size-for-face-hand-bath-cleaning",
      label: "Size Guide",
      labelHi: "साइज़ गाइड",
    },
  ],
  "cushion-covers": [
    {
      path: "/articles/cushion-cover-size-guide-standard-sizes-what-we-stock",
      label: "Size Guide",
      labelHi: "साइज़ गाइड",
    },
  ],
  cushions: [
    {
      path: "/articles/pillows-vs-cushions-fill-and-firmness-guide",
      label: "Fill Guide",
      labelHi: "फिल गाइड",
    },
  ],
  "mattress-covers": [
    {
      path: "/articles/mattress-cover-guide-pvc-waterproof-vs-cotton-which-one-do-you-need",
      label: "Buying Guide",
      labelHi: "खरीद गाइड",
    },
  ],
  "table-covers": [
    {
      path: "/articles/table-cover-guide-pvc-lace-vs-clear-vinyl-vs-cotton-which-one-fits-your-table",
      label: "Buying Guide",
      labelHi: "खरीद गाइड",
    },
  ],
  "table-runners": [
    {
      path: "/articles/table-runner-guide-cotton-velvet-jacquard-lace-which-one-for-which-occasion",
      label: "Buying Guide",
      labelHi: "खरीद गाइड",
    },
  ],
  "hotel-linen": [
    {
      path: "/articles/hotel-bedsheet-buying-guide-gsm-fabric-what-hotels-should-look-for",
      label: "Buying Guide",
      labelHi: "खरीद गाइड",
    },
  ],
  comforters: [
    {
      path: "/articles/comforter-size-guide-single-vs-double-what-gsm-actually-means",
      label: "Size Guide",
      labelHi: "साइज़ गाइड",
    },
  ],
};

const buildCategoryBodyHtml = (
  heading,
  bodyText,
  breadcrumbItems,
  products,
  categorySlug,
  subcategories,
  isHindi = false,
) => {
  const breadcrumbHtml = buildBreadcrumbHtml(breadcrumbItems);
  const categoryUrlPrefix = isHindi ? `${SITE_URL}/hi` : SITE_URL;

  // Every subcategory under this category, grouped by groupLabel — real
  // crawlable links regardless of which group a subcategory belongs to
  // (the client-side CategoryPage.jsx pill row only shows one "primary"
  // group at a time; this flat, complete listing exists purely so no
  // subcategory is ever JS-only-discoverable, not to mirror that UI).
  const subcategoryLinksHtml =
    subcategories && subcategories.length > 0
      ? (() => {
          const byGroup = new Map();
          for (const s of subcategories) {
            const list = byGroup.get(s.groupLabel) || [];
            list.push(s);
            byGroup.set(s.groupLabel, list);
          }
          return [...byGroup.entries()]
            .map(
              ([groupLabel, items]) => `<section>
            <h2>${escapeHtml((isHindi ? friendlyGroupLabelHi(groupLabel) : friendlyGroupLabel(groupLabel)) || "Shop by")}</h2>
            <ul>
              ${items
                .map(
                  (s) =>
                    `<li><a href="${escapeHtml(`${categoryUrlPrefix}/category/${categorySlug}/${s.slug}`)}">${escapeHtml(isHindi ? s.nameHi || s.name : s.name)}</a></li>`,
                )
                .join("\n")}
            </ul>
          </section>`,
            )
            .join("\n");
        })()
      : "";

  const productsHtml = products
    .map((p) => {
      const slug = p.slug || "";
      const productPath = slug ? `/product/${p._id}/${slug}` : `/product/${p._id}`;
      // Only links to the Hindi product page when one actually exists
      // (p.nameHi) -- same "don't advertise an untranslated /hi/ URL"
      // rule used everywhere else, so a product that somehow lacks a
      // Hindi name still gets a real, working (English) link here
      // rather than a broken/redirecting one.
      const href = `${SITE_URL}${isHindi && p.nameHi ? `/hi${productPath}` : productPath}`;
      const displayName = isHindi && p.nameHi ? p.nameHi : p.name;
      const img = imgUrl(p.image);

      return `<li>
        <a href="${escapeHtml(href)}">
          ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(displayName)}" />` : ""}
          <span>${escapeHtml(displayName)}</span>
          <span>₹${escapeHtml(p.price)}</span>
        </a>
      </li>`;
    })
    .join("\n");

  const guideLinks = CATEGORY_GUIDE_LINKS[categorySlug] || [];
  const guideLinksHtml = guideLinks
    .map(
      (g) =>
        `<li><a href="${escapeHtml(`${categoryUrlPrefix}${g.path}`)}">${escapeHtml(isHindi ? g.labelHi : g.label)}</a></li>`,
    )
    .join("\n");

  return `
    <nav aria-label="breadcrumb">${breadcrumbHtml}</nav>
    <h1>${escapeHtml(heading)}</h1>
    ${bodyText ? `<p>${escapeHtml(bodyText)}</p>` : ""}
    ${subcategoryLinksHtml}
    ${guideLinksHtml ? `<ul>${guideLinksHtml}</ul>` : ""}
    <ul>
      ${productsHtml}
    </ul>
  `;
};

// Shared by both the English (/category/...) and Hindi (/hi/category/...)
// branches below -- takes an already-resolved categorySlug/subcategorySlug
// rather than reading raw parts[] itself, specifically so neither caller
// has to duplicate this ~90-line block with its own hand-adjusted parts[]
// offsets (the English and Hindi URL shapes put categorySlug/
// subcategorySlug at different indices -- a second, naively-adapted copy
// of this logic is exactly the kind of easy-to-miss index-shift bug this
// factoring exists to rule out by construction).
//
// Category/Subcategory now have descriptionHi/subtitleHi alongside
// nameHi (added 2026-10-20 -- see bodyText below), content backfill
// in progress. Until every category/subcategory has real Hindi text,
// the Hindi branch's body text and meta description fall back to the
// English description/subtitle, same partial-translation convention
// already used elsewhere on this site.
// Mirrors client/src/utils/subcategorySeoName.js (render.js can't import
// client ESM) -- keep both in sync. See that file for the reasoning.
const SEO_PHRASE_GROUPS = new Set(["By Material", "By Brand"]);
function subcategorySeoName(subcategoryName, groupLabel, categoryName) {
  const sub = (subcategoryName || "").trim();
  const category = (categoryName || "").trim();
  if (!sub || !category || !SEO_PHRASE_GROUPS.has(groupLabel)) return null;
  if (/\s/.test(sub)) return null;
  const stem = category.toLowerCase().replace(/s$/, "");
  if (sub.toLowerCase().includes(stem)) return null;
  return `${sub} ${category}`;
}

// ---- mirrors of client helpers (render.js can't import client ESM) ----
// Keep in sync with CategoryPage.jsx's friendlyGroupLabel/friendlyGroupLabelHi.
const friendlyGroupLabel = (groupLabel) =>
  ({ "By Type": "Type", "By Material": "Material", Size: "Popular Dimensions", "Bed Size": "Bed Type" })[groupLabel] ||
  groupLabel;
const friendlyGroupLabelHi = (groupLabel) =>
  ({
    "By Type": "प्रकार",
    "By Material": "मटीरियल",
    Size: "लोकप्रिय आयाम",
    "Bed Size": "बेड टाइप",
    "By Brand": "ब्रांड",
    "By Pattern": "पैटर्न",
    "By Design": "डिज़ाइन",
  })[groupLabel] || groupLabel;

// Keep in sync with client/src/utils/localizeSize.js.
const SIZE_RULES_HI = [
  [/\bFits mattress up to ([\d.]+(?:\s*x\s*[\d.]+)?)\s*ft,\s*height up to ([\d.]+)"/gi, '$1 फीट तक के गद्दे पर फिट, ऊंचाई $2" तक'],
  [/\bSet of (\d+) Cushion Covers\b/gi, "$1 कुशन कवर का सेट"],
  [/\bSet of (\d+) Cushions\b/gi, "$1 कुशन का सेट"],
  [/\bBook-Style Gift Box\b/gi, "बुक-स्टाइल गिफ्ट बॉक्स"],
  [/\bStandard Single Bed Size\b/gi, "स्टैंडर्ड सिंगल बेड साइज़"],
  [/\bPillow (?:Covers?|Cases)\b/gi, "तकिया कवर"],
  [/\bFitted Bed ?sheet\b/gi, "फिटेड बेडशीट"],
  [/\bBed ?sheet\b/gi, "बेडशीट"],
  [/\bZig Zag\b/gi, "ज़िग-ज़ैग"],
  [/\bDrop\b/gi, "ड्रॉप"],
  [/\bHeight\b/gi, "ऊंचाई"],
  [/\bInch(?:es)?\b/gi, "इंच"],
  [/\bcm\b/gi, "सेमी"],
  [/\bft\b/gi, "फीट"],
  [/\b(\d+) included\b/gi, "$1 शामिल"],
];
const localizeSizeHi = (size) =>
  size ? SIZE_RULES_HI.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), size) : size;

// The delivery lead-in of category meta descriptions, per language (a Hindi
// page used to get the English phrase in the middle of Hindi text).
const deliveryLine = (isHindi) =>
  isHindi ? "पूरे भारत में डिलीवरी, ग़ाज़ियाबाद में 24 घंटे में" : "pan-India delivery, 24hr in Ghaziabad";

// A subcategory that is the only one in its group used to ALWAYS be
// canonicalised to its parent category, on the assumption that it shows the
// same products. That's only true when it holds every one of the
// category's products (comforters / Microfibre, 17 of 17); a genuine subset
// (doormats / Anti-Slip, 9 of 22) is its own page and must keep its own
// canonical + sitemap entry. Same rule in render.js, sitemap.js and
// CategoryPage.jsx -- keep them identical. Without counts (older API) it
// falls back to the old behaviour.
const subcategoryCoversWholeCategory = (sub, category) =>
  typeof sub?.productCount !== "number" ||
  typeof category?.productCount !== "number" ||
  sub.productCount >= category.productCount;

async function buildCategoryMeta({ categorySlug, subcategorySlug, isHindi }) {
  const data = await fetchJson(`${API_BASE}/api/categories`);

  if (!data.success) return null;

  const category = data.categories?.find((c) => c.slug === categorySlug);
  if (!category) return null;

  // Same rule Articles already enforce (see ArticleDetail.jsx / this
  // file's article branch): a /hi/ URL only exists once there's a real
  // Hindi name to serve there, otherwise redirect to the English page
  // instead of silently falling back to an English name under a /hi/
  // URL (which would also disagree with sitemap.js, which already
  // gates its own nameHi-aware entries). Dormant today -- every
  // category currently has nameHi -- but a future category added
  // without an immediate Hindi backfill shouldn't get a live, crawlable
  // half-translated /hi/ page.
  // Uses category.slug (the matched DB record), not the raw categorySlug
  // request param, even though the preceding .find() guarantees they're
  // equal here -- a static analyzer can't see that equality, only that
  // category.slug's taint originates from the trusted categories fetch
  // rather than the URL. See codeql_cross_function_sanitizer_limit.
  if (isHindi && !category.nameHi) {
    return { redirect: `${SITE_URL}/category/${category.slug}` };
  }

  // Fetched unconditionally (not just when a subcategory segment is
  // present) so every category page -- not only subcategory detail
  // pages -- can link to its own subcategories as real <a> tags (see
  // buildCategoryBodyHtml). Before this, a subcategory whose groupLabel
  // wasn't "By Material" or "By Type" (e.g. "Size", "Bed Size") had NO
  // non-JS-discoverable link anywhere except sitemap.xml itself.
  const subRes = await fetchJson(`${API_BASE}/api/subcategories`);
  const categorySubcategories = (subRes.subcategories || []).filter(
    (s) => s.category?._id === category._id,
  );

  let subcategory = null;
  let subcategoryIsOnlyGroupOption = false;
  if (subcategorySlug) {
    subcategory = categorySubcategories.find((s) => s.slug === subcategorySlug);
    // A subcategory slug that doesn't resolve is the same "genuinely
    // doesn't exist" case product/article already 404 on below.
    if (!subcategory) return null;

    // Same nameHi gate as the category check above, one level down --
    // same category.slug/subcategory.slug reasoning applies here too.
    if (isHindi && !subcategory.nameHi) {
      return { redirect: `${SITE_URL}/category/${category.slug}/${subcategory.slug}` };
    }

    // Mirrors CategoryPage.jsx's activeSubcategoryIsOnlyGroupOption: a
    // subcategory that's the sole member of its own group renders the
    // exact same product grid as the parent category -- canonicalize to
    // the parent (within the same language) rather than let Google see
    // two URLs with identical content.
    const ownGroupCount = categorySubcategories.filter(
      (s) => s.groupLabel === subcategory.groupLabel,
    ).length;
    subcategoryIsOnlyGroupOption = ownGroupCount === 1 && subcategoryCoversWholeCategory(subcategory, category);
  }

  const urlPrefix = isHindi ? `${SITE_URL}/hi` : SITE_URL;
  const url = subcategoryIsOnlyGroupOption
    ? `${urlPrefix}/category/${category.slug}`
    : `${urlPrefix}/category/${category.slug}${subcategorySlug ? `/${subcategorySlug}` : ""}`;

  const displayCategoryName = isHindi ? category.nameHi || category.name : category.name;
  const displaySubcategoryName = subcategory
    ? isHindi
      ? subcategory.nameHi || subcategory.name
      : subcategory.name
    : null;

  const categoryPath = `${isHindi ? "/hi" : ""}/category/${category.slug}`;
  const breadcrumbItems = [
    { name: isHindi ? "होम" : "Home", path: isHindi ? "/hi" : "/" },
    ...(subcategory ? [{ name: displayCategoryName, path: categoryPath }] : []),
    { name: subcategory ? displaySubcategoryName : displayCategoryName },
  ];

  // Same lead-in CategoryPage.jsx's <Seo> uses, extended with the
  // subcategory's own name so it isn't just the parent category's copy
  // repeated verbatim.
  const seoPhrase =
    subcategory && !isHindi
      ? subcategorySeoName(subcategory.name, subcategory.groupLabel, category.name)
      : null;
  // Title, h1 and description lead-in are built exactly like
  // CategoryPage.jsx's, so a bot and a visitor see the same page (they had
  // drifted: "Sub | Cat" vs "Sub - Cat", and the client-only Cotton Double
  // Bedsheets title).
  const isCottonDoubleBedsheets = category.slug === "bedsheets" && subcategory?.slug === "double-bed-size";
  const pageTitle = isCottonDoubleBedsheets
    ? isHindi
      ? "कॉटन डबल बेडशीट"
      : "Cotton Double Bedsheets"
    : subcategory
      ? seoPhrase || `${displaySubcategoryName} - ${displayCategoryName}`
      : displayCategoryName;
  const title = `${pageTitle} | ${SITE_NAME}`;
  const headingText = subcategory
    ? seoPhrase || `${displayCategoryName} / ${displaySubcategoryName}`
    : displayCategoryName;
  // descriptionHi/subtitleHi now exist (see Category.js/Subcategory.js --
  // SEO/conversion audit, 2026-10-20) -- still falls back to the English
  // text if a given category/subcategory hasn't been backfilled yet,
  // same partial-translation convention this file already uses
  // elsewhere, but no longer permanently blocked on a full backfill
  // before ANY Hindi hub page gets real body text.
  const bodyText = subcategory
    ? (isHindi ? subcategory.subtitleHi : "") || subcategory.subtitle || ""
    : (isHindi ? category.descriptionHi : "") || category.description || "";
  const description = truncateAtWordBoundary(
    `${pageTitle}: ${deliveryLine(isHindi)}${isHindi ? "।" : "."} ${bodyText}`.trim(),
  );

  // Mirrors CategoryPage.jsx's itemListJsonLd -- same endpoints/params it
  // uses (getProductsByCategory / getProductsBySubcategory), capped the
  // same way. A carousel rich result only needs a representative sample.
  // On the Hindi category page, link each product to its /hi/product/...
  // URL (live since PR #272) when it has a Hindi name, same "don't
  // advertise an untranslated /hi/ URL" guard used in buildCategoryBodyHtml
  // above -- a product that somehow lacks nameHi still gets a real,
  // working English URL instead of a broken one.
  const productsQuery = subcategory
    ? `subcategory=${encodeURIComponent(subcategory._id)}`
    : `category=${encodeURIComponent(category._id)}`;
  const productsData = await fetchJson(`${API_BASE}/api/products?${productsQuery}`);
  const categoryProducts = productsData.success ? productsData.products || [] : [];
  const itemListJsonLd = categoryProducts.length > 0 && {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: categoryProducts.slice(0, 50).map((p, i) => {
      const productSlug = p.slug || "";
      const productPath = productSlug ? `/product/${p._id}/${productSlug}` : `/product/${p._id}`;
      return {
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}${isHindi && p.nameHi ? `/hi${productPath}` : productPath}`,
      };
    }),
  };

  const enUrl = `${SITE_URL}/category/${category.slug}${!subcategoryIsOnlyGroupOption && subcategorySlug ? `/${subcategorySlug}` : ""}`;
  const hiUrl = `${SITE_URL}/hi/category/${category.slug}${!subcategoryIsOnlyGroupOption && subcategorySlug ? `/${subcategorySlug}` : ""}`;

  return {
    title,
    description,
    image: imgUrl(category.image) || DEFAULT_IMAGE,
    url,
    lang: isHindi ? "hi" : "en",
    alternateLangs: [
      { lang: "en", url: enUrl },
      { lang: "hi", url: hiUrl },
      { lang: "x-default", url: enUrl },
    ],
    ogType: "website",
    jsonLd: [buildBreadcrumbJsonLd(breadcrumbItems), itemListJsonLd].filter(Boolean),
    // Full list, not the JSON-LD block's 50-item cap above — this is
    // meant to mirror what a real visitor's browser actually renders
    // (Google's guidelines on dynamic rendering expect bots and real
    // users to see materially the same content, not an artificially
    // trimmed version), and no category here has anywhere near enough
    // products yet for 50 to matter in practice.
    bodyHtml: buildCategoryBodyHtml(
      headingText,
      bodyText,
      breadcrumbItems,
      categoryProducts,
      category.slug,
      categorySubcategories,
      isHindi,
    ),
    // Real-user-only, same pattern as buildProductMeta's own preloadData/
    // prepaintHtml (see its comment) -- categorySlug/subcategorySlug ride
    // along so CategoryPage.jsx can confirm this preload actually matches
    // the page it landed on before using it, same safety check
    // productService.js's getProductById does by `_id`. Deliberately NOT
    // including settings/bundleRules here (CategoryPage.jsx's own
    // Promise.all also fetches those) -- the bundle-discount banner isn't
    // the LCP element and isn't worth replicating render.js's reach into
    // settings just to shave one more parallel fetch.
    preloadData: {
      categorySlug: category.slug,
      subcategorySlug: subcategory?.slug || null,
      categories: data.categories,
      subcategories: subRes.subcategories || [],
      products: categoryProducts,
    },
    preloadKey: "__PRELOADED_CATEGORY__",
    prepaintHtml: buildCategoryPrepaintHtml(categoryProducts),
  };
}

// Articles and policy pages (privacy/returns/shipping/terms) both already
// store their body as real, admin-authored HTML (`<p>`/`<h2>`/etc, the
// same shape ArticleDetail.jsx / the policies page render client-side) —
// trusted content, not raw user input, so it's embedded as-is rather than
// escaped (escaping it would show literal "<p>" tags as text instead of
// rendering them).
const buildRichContentBodyHtml = (breadcrumbItems, heading, contentHtml) => `
    <nav aria-label="breadcrumb">${buildBreadcrumbHtml(breadcrumbItems)}</nav>
    <h1>${escapeHtml(heading)}</h1>
    ${contentHtml || ""}
  `;

// For the handful of pages with no richer content than their own
// title/description (STATIC_PAGES, /contact, /ghaziabad-home-furnishing-
// store, the homepage) — still real visible text instead of an empty
// body, just a single paragraph rather than a full article/product/
// category's worth of content, since there's nothing more specific to
// give a crawler for these.
const buildSimpleBodyHtml = (breadcrumbItems, heading, description) => `
    <nav aria-label="breadcrumb">${buildBreadcrumbHtml(breadcrumbItems)}</nav>
    <h1>${escapeHtml(heading)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
  `;

// /articles and /hi/articles used to render through buildSimpleBodyHtml
// above (via the generic STATIC_PAGES branch), which gave a bot nothing
// but a breadcrumb + h1 + one boilerplate paragraph -- zero links to any
// of the real articles underneath it. A live GSC check (2026-10-09)
// confirmed Google crawled exactly that thin body and excluded the page
// ("Crawled - currently not indexed") while the individual article pages
// themselves rank fine (they get their own real content via the
// parts[0]==="articles" branch below). Mirrors buildCategoryBodyHtml's
// existing real-<ul>-of-links pattern instead of inventing a new one.
const buildArticleListBodyHtml = (breadcrumbItems, heading, intro, articles, isHindi) => {
  const articleLinksHtml = articles
    .map((a) => {
      const title = isHindi ? a.titleHi : a.title;
      const excerpt = isHindi ? a.excerptHi || a.excerpt : a.excerpt;
      const href = `${SITE_URL}${isHindi ? "/hi" : ""}/articles/${a.slug}`;

      return `<li>
        <a href="${escapeHtml(href)}">${escapeHtml(title)}</a>
        ${excerpt ? ` — ${escapeHtml(excerpt)}` : ""}
      </li>`;
    })
    .join("\n");

  return `
    <nav aria-label="breadcrumb">${buildBreadcrumbHtml(breadcrumbItems)}</nav>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(intro)}</p>
    <ul>
      ${articleLinksHtml}
    </ul>
  `;
};

// The homepage is the single most-crawled, highest-authority page on
// the site -- real links to a category here pass that straight through
// to pages Google has otherwise been slow to prioritize crawling (see
// [[crawl_indexation_audit_2026-09-28]]: Table Covers/Table Runners
// sitting at "URL is unknown to Google" despite being in the sitemap).
// Mirrors the client-side homepage's CategoryQuickLinks + ShopByNeed
// sections -- every category, plus every subcategory -- as real
// crawlable <a> tags, not just the single generic paragraph this body
// used to be. Deliberately NOT filtered to "By Material"/"By Type" the
// way the earlier version was -- that filter silently dropped every
// "Size"/"Bed Size"-grouped subcategory from the one page on the site
// with the most crawl authority, which a live GSC ground-truth scan
// (2026-10-07) confirmed left several of them sitting at "Discovered -
// currently not indexed" with no other non-JS-discoverable link at all
// (see buildCategoryBodyHtml's own subcategory-links addition, the
// same day, for the other half of this fix).
const buildHomeBodyHtml = (heading, description, categories, subcategories, isHindi = false) => {
  const urlPrefix = isHindi ? "/hi" : "";
  const categoryLinksHtml = categories
    .map(
      (c) =>
        `<li><a href="${escapeHtml(`${SITE_URL}${urlPrefix}/category/${c.slug}`)}">${escapeHtml(isHindi ? c.nameHi || c.name : c.name)}</a></li>`,
    )
    .join("\n");

  const categoryMap = new Map(categories.map((c) => [c._id, c]));
  const shopByNeedHtml = subcategories
    .map((s) => {
      const category = categoryMap.get(s.category?._id);
      if (!category) return "";
      // English anchor text uses the natural search phrase where one exists
      // ("Satin Curtains", not just "Satin") -- GSC shows those queries
      // landing on the homepage instead of the subcategory page.
      const label = isHindi ? s.nameHi || s.name : subcategorySeoName(s.name, s.groupLabel, category.name) || s.name;
      return `<li><a href="${escapeHtml(`${SITE_URL}${urlPrefix}/category/${category.slug}/${s.slug}`)}">${escapeHtml(label)}</a></li>`;
    })
    .join("\n");

  return `
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(description)}</p>
    <nav aria-label="Shop by category">
      <h2>${isHindi ? "कैटेगरी के अनुसार खरीदें" : "Shop by Category"}</h2>
      <ul>
        ${categoryLinksHtml}
      </ul>
    </nav>
    ${
      shopByNeedHtml
        ? `<nav aria-label="Shop by need">
      <h2>${isHindi ? "ज़रूरत के अनुसार खरीदें" : "Shop by Need"}</h2>
      <ul>
        ${shopByNeedHtml}
      </ul>
    </nav>`
        : ""
    }
    <p><a href="${escapeHtml(`${SITE_URL}${urlPrefix}/articles`)}">${isHindi ? "गाइड और आइडियाज़ देखें" : "Browse our guides & ideas"}</a></p>
  `;
};

// Static pages whose title/description never depend on data — a plain
// copy of each page's own <Seo title=... description=... /> call (see
// About.jsx, Contact.jsx, Rewards.jsx, etc.), kept in sync by hand since
// this serverless function doesn't share a bundle with client/src. None
// of these were reachable through vercel.json's bot `has` rewrites before
// (only /product, /category and /articles were), so a crawler hitting
// any of them got the plain SPA shell — which, worse, carries the
// homepage's own static title/description baked into index.html, so
// Search Console and WhatsApp/Facebook previews showed the HOMEPAGE's
// title for e.g. a shared /gifting or /rewards link instead of the
// page's own.
const STATIC_PAGES = {
  "/about": {
    // Kept in sync with About.jsx's <Seo> call by hand (see this file's
    // header comment) -- this entry previously still held the ORIGINAL
    // generic copy from before a past round replaced it client-side
    // after Search Console showed 0% CTR at a decent position despite
    // real impressions. Bots never saw the fix because they're routed
    // here, never to the real React app.
    title: "About Us — Why Mittal Collections | Home Furnishing",
    description:
      "Mittal Collections: a focused range of bedsheets, towels, curtains and cushions chosen for real material quality, not sheer catalog size. Pan-India delivery, easy returns, 24-hour delivery in Ghaziabad.",
    breadcrumb: "About",
  },
  "/contact": {
    title: "Contact Us",
    description:
      "Get in touch with Mittal Collections for order support, returns, bulk orders or general questions about our home furnishing products.",
    breadcrumb: "Contact Us",
  },
  "/ghaziabad-home-furnishing-store": {
    title: "Home Furnishing Store in Ghaziabad — Mittal Collections",
    description:
      "Mittal Collections is a home furnishing store in Sector 3, Vasundhara, Ghaziabad, near Vanasthali Public School — bedsheets, curtains, towels & more with 24-hour local delivery across Vasundhara, Vaishali, Indirapuram and nearby areas.",
    breadcrumb: "Home Furnishing Store in Ghaziabad",
  },
  "/rewards": {
    title: "Rewards Program — Earn While You Shop",
    description:
      "How Mittal Collections' rewards program works: welcome offer, loyalty points, referrals and review bonuses.",
    breadcrumb: "Rewards",
  },
  "/trending": {
    title: "Top Trending Home Furnishing Products",
    description:
      "Handpicked by our team - the home furnishing pieces everyone's loving right now at Mittal Collections, organised by category.",
    breadcrumb: "Top Trending",
  },
  "/clearance-sale": {
    title: "Clearance Sale — Home Furnishing Deals",
    description:
      "More than 35% off select home furnishing items at Mittal Collections — limited stock, won't be restocked at this price.",
    breadcrumb: "Clearance Sale",
  },
  "/new-arrivals": {
    title: "New Arrivals — Home Furnishing",
    description:
      "The newest home furnishing pieces at Mittal Collections, organised by category - bedsheets, cushion covers, doormats and more.",
    breadcrumb: "New Arrivals",
  },
  "/gifting": {
    title: "Gifting — Home Furnishing Gift Ideas",
    description:
      "Ready-to-gift home furnishing picks at Mittal Collections — housewarmings, weddings and festive occasions, no separate wrapping needed.",
    breadcrumb: "Gifting",
  },
  "/curtain-size-calculator": {
    // Kept in sync with CurtainSizeCalculator.jsx's <Seo> -- see that
    // file's comment (a real "calculate curtain size" Search Console
    // query landing this page at position 83 despite solid on-page
    // content, 2026-09-25).
    title: "Calculate Curtain Size & Rod Length",
    description:
      "Calculate your curtain size, rod length and fabric width free — enter your window measurements and get the exact size to buy, plus a size chart.",
    breadcrumb: "Curtain Size Calculator",
    // The generic STATIC_PAGES branch below only ever emits a
    // BreadcrumbList -- CurtainSizeCalculator.jsx's own client-side
    // <Seo jsonLd> additionally builds a WebApplication + FAQPage block
    // (real visitors see it), but bots are always routed here instead
    // of the real SPA (see this file's header comment) and never got a
    // mirrored copy, so Googlebot saw neither block. Kept in sync by
    // hand with CurtainSizeCalculator.jsx's FAQS_EN array.
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Curtain Size Calculator",
        applicationCategory: "UtilitiesApplication",
        description:
          "Free tool to calculate the curtain size, rod length and fabric width you need based on your window measurements.",
        url: `${SITE_URL}/curtain-size-calculator`,
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            q: "How do I calculate curtain size from window measurements?",
            a: "Measure your window's width and drop (height) in inches, then multiply the width by your chosen fullness (2x is standard) to get the fabric width you need. This calculator does that math for you and rounds it up to the nearest standard size sold in stores.",
          },
          {
            q: "How do I calculate curtain rod length?",
            a: "Rod length = window width + overhang on each side. For an outside-mount rod, add 4–6 inches of overhang per side so the curtain can fully clear the window when opened. Enter your window width above and pick \"Outside Mount\" to get the exact rod length.",
          },
          {
            q: "Does this calculator work in inches or feet?",
            a: "Enter your measurements in inches (the most common way windows are measured in India) — the calculator instantly converts and rounds the result to the nearest standard feet size (like 4x7 ft or 5x9 ft) that curtains are actually sold in.",
          },
          {
            q: "How much fabric width do I need for curtains?",
            a: "For a natural, gathered drape, buy 1.5–2.5 times your rod length in total fabric width — 2x (\"Full\") is the most popular choice. Split that total evenly across your number of panels (usually 2).",
          },
          {
            q: "What are the standard curtain sizes available in India?",
            a: "The most common ready-made curtain sizes are 4x5 ft, 4x7 ft, 4.5x7 ft, 5x7 ft, 5x9 ft and 7x9 ft — see the size chart below for which one fits your window.",
          },
        ].map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  },
  "/articles": {
    title: "Guides & Ideas",
    description:
      "Home furnishing guides, buying tips and styling ideas from Mittal Collections — bedsheets, curtains, towels and more.",
    breadcrumb: "Guides & Ideas",
    lang: "en",
  },
  "/hi/articles": {
    title: "गाइड और आइडिया",
    description:
      "मित्तल कलेक्शंस से घर की साज-सज्जा की गाइड, खरीदारी के सुझाव और सजावट के आइडिया — चादर, पर्दे, तौलिए और भी बहुत कुछ।",
    breadcrumb: "गाइड और आइडिया",
    lang: "hi",
  },
};

// Mirrors client/src/utils/breadcrumbJsonLd.js — kept as its own plain copy
// here since this serverless function doesn't share a bundle with client/src.
const buildBreadcrumbJsonLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    ...(item.path && { item: `${SITE_URL}${item.path}` }),
  })),
});

// `query` carries the page's own query string (Vercel passes it through
// the rewrite); only ?size= on product pages is used.
const buildMeta = async (path, query = {}) => {
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0 || (parts.length === 1 && parts[0] === "hi")) {
    // Homepage (English "/" and Hindi "/hi") — mirrors Home.jsx's <Seo>
    // call and HomeGoodsStore schema. A bare "/" is unreachable through
    // vercel.json's `rewrites` no matter the bot user-agent `has`
    // condition — Vercel serves the static index.html straight from its
    // filesystem/edge cache for an exact "/" match, ahead of `rewrites`
    // (/category and /articles don't have this problem since no static
    // file exists at those paths to collide with). /client/middleware.js
    // is what actually routes a bot's "/" request here now, since Edge
    // Middleware runs ahead of that static-file lookup — this branch is
    // what it lands on. "/hi" has no such static-file collision, so
    // vercel.json's own bot `has` rewrite (added alongside this) routes
    // it here directly, same as every other bot-prerendered route.
    //
    // "/hi" previously had no branch here at all (buildMeta fell through
    // to the generic 404) and no matching <Route> in AppRoutes.jsx either
    // — a real-browser visit to the bare Hindi homepage landed on the
    // client-side NotFound page (200, noindexed, "Page Not Found") while
    // Googlebot got a real 404 for the same URL. Found via a live-DOM
    // Playwright audit (2026-10-16), fixed here plus AppRoutes.jsx,
    // vercel.json and sitemap.js together.
    const isHindi = parts.length === 1;
    const [settingsData, categoriesData, subcategoriesData, rewardsData] = await Promise.all([
      fetchJson(`${API_BASE}/api/settings`),
      fetchJson(`${API_BASE}/api/categories`),
      fetchJson(`${API_BASE}/api/subcategories`),
      safeFetchJson(`${API_BASE}/api/rewards/public`),
    ]);
    const settings = settingsData.settings || {};
    const homeCategories = categoriesData.success ? categoriesData.categories || [] : [];
    const homeSubcategories = subcategoriesData.success
      ? subcategoriesData.subcategories || []
      : [];
    const freeShippingThreshold = settings.freeShippingThreshold ?? 499;
    const earnRate = rewardsData.success ? rewardsData.loyalty?.earnRate ?? 20 : 20;

    // Mirrors Faq.jsx's faqs array + faqJsonLd exactly (same questions,
    // same two dynamic values) -- that component's FAQPage schema was
    // never reaching Googlebot at all, since it only ever renders
    // client-side and bots are always routed here instead. English
    // only (no Hindi variant) -- same single-language choice every
    // other piece of this file's structured data already makes, there's
    // no reliable "which language" signal for a bot-served response the
    // way there is for a real visitor's own language setting.
    const faqJsonLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Do you offer free shipping?",
          acceptedAnswer: {
            "@type": "Answer",
            text: `Yes! Orders above ₹${freeShippingThreshold} get free shipping. Below that, the delivery fee is small and gets lower the closer your order is to ₹${freeShippingThreshold}.`,
          },
        },
        {
          "@type": "Question",
          name: "Is Cash on Delivery (COD) available?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, Cash on Delivery is available on all orders across India, in addition to online payment.",
          },
        },
        {
          "@type": "Question",
          name: "What is your return policy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You can return an unused product in its original packaging within 7 days of delivery. Once we receive and inspect it, your refund is processed within 5-7 business days.",
          },
        },
        {
          "@type": "Question",
          name: "How long does delivery take?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Orders are dispatched within 1-2 business days and typically delivered in 3-7 business days depending on your location.",
          },
        },
        {
          "@type": "Question",
          name: "Do I earn rewards on my purchase?",
          acceptedAnswer: {
            "@type": "Answer",
            text: `Yes! You earn 1 loyalty point for every ₹${earnRate} you spend, which you can redeem for a discount on a future order.`,
          },
        },
        {
          "@type": "Question",
          name: "How can I get help before ordering?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Chat with us anytime on WhatsApp using the button at the bottom-left of the screen, or reach out from our Contact page.",
          },
        },
      ],
    };

    // Base fields unconditional, same reasoning as Home.jsx's
    // baseOrganizationJsonLd — never depends on settings.address, so a
    // bot never sees zero structured data on the homepage just because
    // that admin field is unset. sameAs added once settings resolve,
    // matching Home.jsx's organizationJsonLd exactly.
    const socialSameAs = [
      settings.facebook,
      settings.instagram,
      settings.twitter,
      settings.linkedin,
    ].filter(Boolean);
    const organizationJsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      // Mirrors Home.jsx's baseOrganizationJsonLd -- icon-512.png is the
      // site's only real brand mark (a gold circular "M" monogram used
      // as the PWA icon).
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon-512.png`,
      },
      ...(socialSameAs.length > 0 && { sameAs: socialSameAs }),
    };
    const websiteJsonLd = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      // Mirrors Home.jsx's websiteJsonLd — this was previously only
      // added client-side, so Googlebot (routed here for every request,
      // never reaching the real React app) never saw the Sitelinks
      // Searchbox markup at all.
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    };

    const localBusinessJsonLd = buildLocalBusinessJsonLd(settings, {
      // Same PIN code /contact and the Ghaziabad store page already pass
      // explicitly — the homepage's own call was the one place still
      // relying on settings.address's plain text (which happens to end
      // in the PIN but isn't parsed into a structured field), which
      // Google's Rich Results Test flags as a missing optional field on
      // the Organization/LocalBusiness address (2026-10-14).
      postalCode: "201012",
      includeAreaServed: true,
    });

    // Kept in sync with Home.jsx's <Seo title>/description (both
    // languages) — this is the version Googlebot actually sees (it's
    // always routed here, never to the real React app), so a mismatch
    // here is the real SEO bug, not the client-side one. Bare title must
    // stay short enough that appending " | SITE_NAME" doesn't push the
    // final <title> past Google's ~60-char truncation point.
    const homeTitle = isHindi
      ? "बेडशीट, पर्दे, होम डेकोर ऑनलाइन"
      : "Bedsheets, Curtains, Home Decor Online";
    const homeDescription = isHindi
      ? "Mittal Collections पर बेडशीट, कम्फर्टर, पर्दे और होम फर्निशिंग ऑनलाइन खरीदें। हर कमरे के लिए स्टाइलिश डिज़ाइन और क्वालिटी फैब्रिक एक्सप्लोर करें।"
      : "Shop bedsheets, comforters, curtains and home furnishings online at Mittal Collections. Explore stylish designs, quality fabrics and home essentials for every room.";
    const enHomeUrl = `${SITE_URL}/`;
    const hiHomeUrl = `${SITE_URL}/hi`;

    return {
      title: `${homeTitle} | ${SITE_NAME}`,
      description: homeDescription,
      image: DEFAULT_IMAGE,
      url: isHindi ? hiHomeUrl : enHomeUrl,
      lang: isHindi ? "hi" : "en",
      alternateLangs: [
        { lang: "en", url: enHomeUrl },
        { lang: "hi", url: hiHomeUrl },
        { lang: "x-default", url: enHomeUrl },
      ],
      ogType: "website",
      jsonLd: [organizationJsonLd, websiteJsonLd, localBusinessJsonLd, faqJsonLd].filter(
        Boolean,
      ),
      bodyHtml: buildHomeBodyHtml(homeTitle, homeDescription, homeCategories, homeSubcategories, isHindi),
    };
  }

  if (parts[0] === "product" && parts[1]) {
    return buildProductMeta({ productId: parts[1], productSlug: parts[2], isHindi: false, size: query.size });
  }

  // Hindi product pages. Same shared-function pattern as the category
  // branch above -- parts[0]="hi", parts[1]="product", parts[2]=id,
  // parts[3]=slug, one index over from the English shape -- rather than
  // a second hand-adjusted copy of this block.
  if (parts[0] === "hi" && parts[1] === "product" && parts[2]) {
    return buildProductMeta({ productId: parts[2], productSlug: parts[3], isHindi: true, size: query.size });
  }

  async function buildProductMeta({ productId, productSlug, isHindi, size }) {
    // Fetched together — none depend on each other, and ProductDetails.jsx
    // loads all four independently too (reviews/questions/settings never
    // block the product itself from rendering).
    const [data, settingsData, reviewsData, questionsData] = await Promise.all([
      fetchJson(`${API_BASE}/api/products/${productId}`),
      fetchJson(`${API_BASE}/api/settings`),
      safeFetchJson(`${API_BASE}/api/reviews/product/${productId}`),
      safeFetchJson(`${API_BASE}/api/questions/product/${productId}`),
    ]);

    if (!data.success) return null;

    const p = data.product;

    // Same rule Articles/Categories already enforce: a /hi/ URL only
    // exists once there's a real Hindi name to serve there. Dormant
    // today (per the 2026-10-07 Hindi-specs backfill, all 155 products
    // have nameHi) but closes the gap for a future product added
    // without an immediate Hindi backfill.
    if (isHindi && !p.nameHi) {
      const enSlug = p.slug || productSlug || "";
      return { redirect: `${SITE_URL}${enSlug ? `/product/${p._id}/${enSlug}` : `/product/${p._id}`}` };
    }
    const settings = settingsData.settings || {};
    const plainDescription = stripHtml(isHindi ? p.descriptionHi || p.description : p.description);
    // Google's Product rich-result guidance wants multiple angles when
    // they exist, not just the main photo — mirrors ProductDetails.jsx's
    // productImages fallback (full gallery, or the single main image when
    // no gallery array is set).
    // .length ? ... : [DEFAULT_IMAGE] guards productJsonLd's `image` below
    // (schema.org requires a non-empty value there) for the edge case
    // where a product has neither `images` nor a singular `image` set --
    // both are schema-optional with an empty-string default.
    const galleryImagesRaw = (p.images?.length ? p.images : [p.image])
      .filter(Boolean)
      .map(imgUrl);
    const galleryImages = galleryImagesRaw.length ? galleryImagesRaw : [DEFAULT_IMAGE];
    const image = galleryImages[0];
    // Self-heal to the product's *current* slug rather than echoing back
    // whatever slug the request happened to use — otherwise a renamed
    // product's stale URL (still reachable, since only the id is looked
    // up) canonicalizes to itself instead of the real current URL, which
    // is exactly what produced Search Console's "Duplicate without
    // user-selected canonical" for these pages. Matches the client-side
    // productUrl() helper's own self-healing behaviour. Same currentSlug
    // (no separate slugHi) under either prefix -- matches productUrl()'s
    // own isHindi handling client-side.
    const currentSlug = p.slug || productSlug || "";
    const enCanonicalPath = currentSlug ? `/product/${p._id}/${currentSlug}` : `/product/${p._id}`;
    const hiCanonicalPath = `/hi${enCanonicalPath}`;
    const canonicalPath = isHindi ? hiCanonicalPath : enCanonicalPath;
    const url = `${SITE_URL}${canonicalPath}`;
    const categoryUrlPrefix = isHindi ? "/hi" : "";

    // Mirrors ProductDetails.jsx's breadcrumbItemsForSeo — a subcategory
    // segment used to be dropped here, giving bots a shorter breadcrumb
    // than the one the site itself defines for the same product.
    const breadcrumbItems = [
      { name: isHindi ? "होम" : "Home", path: isHindi ? "/hi" : "/" },
      ...(p.category
        ? [
            {
              name: isHindi ? p.category.nameHi || p.category.name : p.category.name,
              path: `${categoryUrlPrefix}/category/${p.category.slug}`,
            },
          ]
        : []),
      ...(p.subcategories?.[0] && p.category
        ? [
            {
              name: isHindi
                ? p.subcategories[0].nameHi || p.subcategories[0].name
                : p.subcategories[0].name,
              path: `${categoryUrlPrefix}/category/${p.category.slug}/${p.subcategories[0].slug}`,
            },
          ]
        : []),
      { name: isHindi ? p.nameHi : p.name },
    ];

    // Mirrors ProductDetails.jsx's seoTitle — p.name already carries the
    // exact dimension by convention, so appending p.size duplicated it.
    const seoTitle = isHindi ? p.nameHi : p.name;

    // Mirrors ProductDetails.jsx's displayPrice/displayStock — a
    // variant product's flat p.price only mirrors variants[0], but flat
    // p.stock is the SUM of every variant (see Product.js). Bots see
    // the same default-selected variant a visitor would on first load
    // (variants[0]), so the offer must reflect THAT variant's own
    // price/stock, not the misleading summed stock -- otherwise a
    // sold-out default variant with stock left in another size still
    // reports InStock here while the page itself would show Out of
    // Stock, a real Merchant Center suspension risk.
    // A ?size= link (one per size in the Shopping feed) shows that size,
    // like ProductDetails.jsx does, so the price matches the listing.
    const defaultVariant =
      (typeof size === "string" && size && p.variants?.find((v) => v.size === size)) || p.variants?.[0];
    const offerPrice = defaultVariant ? defaultVariant.price : p.price;
    const offerStock = defaultVariant ? defaultVariant.stock : p.stock;

    // Mirrors ProductDetails.jsx's <Seo description> — shorter lead-in
    // than the old "Buy online, pan-India delivery (24hr in Ghaziabad)
    // - " (53 chars, ate a third of the 160-char budget before any
    // product-specific content got a chance to show). Price leads the
    // snippet now, not buried after it — live GSC data on this
    // catalog's lower-priced products (₹80-230 towels ranking well,
    // 0% CTR) pointed at price-sensitive shoppers not getting enough of
    // a hook to click.
    // Hindi phrasing matches WhyChooseUs.jsx's existing "पूरे भारत में
    // डिलीवरी, ग़ाज़ियाबाद में 24 घंटे में तेज़ डिलीवरी।" wording exactly,
    // rather than inventing new phrasing for the same fact.
    const description = isHindi
      ? plainDescription
        ? truncateAtWordBoundary(`₹${offerPrice}। पूरे भारत में डिलीवरी, ग़ाज़ियाबाद में 24 घंटे में तेज़ डिलीवरी। ${plainDescription}`)
        : truncateAtWordBoundary(`₹${offerPrice} — ${p.nameHi}, पूरे भारत में डिलीवरी, ग़ाज़ियाबाद में 24 घंटे में तेज़ डिलीवरी`)
      : p.description
        ? truncateAtWordBoundary(`₹${offerPrice}. Pan-India delivery, 24hr in Ghaziabad. ${plainDescription}`)
        : truncateAtWordBoundary(`₹${offerPrice} — ${p.name}, pan-India delivery, fast 24-hour delivery in Ghaziabad`);

    // Mirrors ProductDetails.jsx's effectiveReturnDaysForSeo/shippingFeeForSeo
    // — these unlock the enhanced free-listing treatment in Google
    // Shopping/Search (shipping cost + delivery time, return window shown
    // directly on the listing), built from the same settings/return-policy
    // data the checkout page already uses.
    const effectiveReturnDays = p.returnPeriodDays || settings.defaultReturnPeriodDays;
    const shippingFee = calculateDeliveryFee(p.price, settings);

    const reviews = reviewsData.success ? reviewsData.reviews || [] : [];
    const totalReviews = reviewsData.success ? reviewsData.totalReviews || 0 : 0;
    const averageRating = reviewsData.success ? reviewsData.averageRating || 0 : 0;
    const questions = questionsData.success ? questionsData.questions || [] : [];

    const productJsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      // Matches the page's own visible language -- structured data
      // disagreeing with what's actually on the page is the same class
      // of issue the brand-hardcoding fix addressed earlier.
      name: isHindi ? p.nameHi : p.name,
      description: plainDescription,
      image: galleryImages,
      // The product's own Mongo _id -- already the unique identifier used
      // everywhere else (product URLs, the Merchant Center/Meta feed's
      // <g:id> in feedController.js) -- NOT generateProductNumber
      // (costCipher.js), which deliberately encodes purchase price and
      // purchase date for the admin's own shelf-label decode tool. Using
      // that here would have published every product's cost price in
      // Google's own structured data.
      sku: p._id,
      // Falls back to SITE_NAME only when the product genuinely has no
      // brand set (81/155 today) -- this used to be hardcoded to
      // SITE_NAME unconditionally, silently overwriting the real p.brand
      // for every branded product (74/155) even though that same value
      // is correctly shown in the page's own visible "Brand: ..." line
      // just below. A structured-data/visible-content mismatch like
      // that is exactly what Google's guidelines flag, and a real
      // Merchant Center risk for anything actually branded.
      brand: { "@type": "Brand", name: p.brand || SITE_NAME },
      // Shared by every Offer below (single or per-variant) -- shipping
      // and return terms don't vary by size, only price/availability do.
      ...(() => {
        const sharedOfferTerms = {
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingRate: {
              "@type": "MonetaryAmount",
              value: shippingFee,
              currency: "INR",
            },
            shippingDestination: {
              "@type": "DefinedRegion",
              addressCountry: "IN",
            },
            // Matches the "Usually delivered in 3-7 business days" promise
            // shown elsewhere on the site (Footer, delivery-info banners) —
            // same-day Ghaziabad express delivery is a separate Google
            // Merchant Center delivery policy, not this one.
            deliveryTime: {
              "@type": "ShippingDeliveryTime",
              handlingTime: {
                "@type": "QuantitativeValue",
                minValue: 0,
                maxValue: 0,
                unitCode: "DAY",
              },
              transitTime: {
                "@type": "QuantitativeValue",
                minValue: 3,
                maxValue: 7,
                unitCode: "DAY",
              },
            },
          },
          hasMerchantReturnPolicy: p.isReturnable
            ? {
                "@type": "MerchantReturnPolicy",
                applicableCountry: "IN",
                returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
                merchantReturnDays: effectiveReturnDays,
                returnFees: "https://schema.org/FreeReturn",
                // Flagged by Search Console (2026-10-03, "Merchant listings
                // structured data issues") as a missing recommended field.
                // ReturnByMail matches how a return actually happens here --
                // a courier pickup/return shipment, not a customer walking
                // into the Ghaziabad shop with the item.
                returnMethod: "https://schema.org/ReturnByMail",
              }
            : {
                "@type": "MerchantReturnPolicy",
                applicableCountry: "IN",
                returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
              },
        };

        // Sized products (curtains etc.) used to report only
        // variants[0]'s price/stock here, same as the page's own
        // default-selected display -- but unlike the visible page (where
        // a visitor can click another size), Google only ever sees this
        // one static snapshot. If variants[0] sells out while a 9x4 ft
        // size is still in stock, Google kept being told OutOfStock for
        // an item that was actually purchasable -- a real Merchant
        // Center risk, confirmed live on multiple curtain products (SEO/
        // conversion audit, 2026-10-20). An array of Offers, one per
        // variant, is a standard, Rich-Results-Test-valid way to
        // represent several purchasable options at the same URL without
        // a larger ProductGroup/hasVariant rearchitecture.
        if (p.variants?.length > 1) {
          return {
            offers: p.variants.map((variant) => ({
              "@type": "Offer",
              priceCurrency: "INR",
              price: variant.price,
              availability:
                variant.stock > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              url: `${url}?size=${encodeURIComponent(variant.size)}`,
              sku: `${p._id}-${variant.size}`,
              name: `${isHindi ? p.nameHi : p.name} - ${variant.size}`,
              ...sharedOfferTerms,
            })),
          };
        }

        return {
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: offerPrice,
            availability:
              offerStock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            url,
            ...sharedOfferTerms,
          },
        };
      })(),
      ...(totalReviews > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: averageRating.toFixed(1),
          reviewCount: totalReviews,
        },
      }),
      ...(reviews.length > 0 && {
        review: reviews.slice(0, 10).map((r) => ({
          "@type": "Review",
          author: { "@type": "Person", name: r.user?.name || "Customer" },
          reviewRating: {
            "@type": "Rating",
            ratingValue: r.rating,
            bestRating: 5,
            worstRating: 1,
          },
          reviewBody: r.content,
          datePublished: r.createdAt,
          ...(r.images?.length > 0 && { image: r.images }),
        })),
      }),
    };

    // Standalone VideoObject, not nested in productJsonLd — `video` isn't
    // a valid schema.org property on Product (see ProductDetails.jsx's
    // own comment on this, a self-caught bug from an earlier round).
    const videoJsonLd = (p.videos || []).map((videoUrl) => ({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: isHindi ? p.nameHi : p.name,
      description: plainDescription,
      thumbnailUrl: image,
      contentUrl: videoUrl,
      uploadDate: p.createdAt,
    }));

    const faqJsonLd = questions.length > 0 && {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: q.answer,
        },
      })),
    };

    // Only advertised once a real Hindi name exists -- same rule the
    // nameHi gate above already enforces for actually serving the /hi/
    // page, so this is always true by the time this return is reached.
    const alternateLangs = p.nameHi
      ? [
          { lang: "en", url: `${SITE_URL}${enCanonicalPath}` },
          { lang: "hi", url: `${SITE_URL}${hiCanonicalPath}` },
          { lang: "x-default", url: `${SITE_URL}${enCanonicalPath}` },
        ]
      : undefined;

    // Related products -- a product page was otherwise a dead end beyond
    // one breadcrumb link for a non-JS crawler. ProductDetails.jsx
    // already builds this same same-category list client-side via this
    // exact endpoint, but bots never run that JS (SEO/conversion audit,
    // 2026-10-20). safeFetchJson never throws, so a failure here just
    // means an empty related-products section, never a broken page.
    const relatedProductsData = p.category
      ? await safeFetchJson(`${API_BASE}/api/products?category=${p.category._id}`)
      : null;
    const relatedProducts = (relatedProductsData?.products || [])
      .filter((rp) => rp._id !== p._id)
      .slice(0, 10);

    return {
      title: `${seoTitle} | ${SITE_NAME}`,
      description,
      image,
      url,
      ogType: "product",
      lang: isHindi ? "hi" : "en",
      alternateLangs,
      jsonLd: [
        productJsonLd,
        buildBreadcrumbJsonLd(breadcrumbItems),
        faqJsonLd,
        ...videoJsonLd,
      ].filter(Boolean),
      bodyHtml: buildProductBodyHtml(
        p,
        plainDescription,
        offerPrice,
        offerStock,
        breadcrumbItems,
        galleryImages,
        isHindi,
        relatedProducts,
      ),
      // Real-user-only fields (bots never run JS, so these are wasted
      // bytes for them, but injectMeta writes them unconditionally since
      // it has no reliable way to tell a bot request from a real one at
      // this point -- the vercel.json rewrite that reaches this function
      // no longer gates on user-agent for product pages, see that file).
      // preloadData lets client/src/services/productService.js's
      // getProductById skip its own redundant fetch on first load --
      // this function already did that exact fetch above. prepaintHtml
      // paints the real hero image before React/JS has even executed,
      // same technique as the homepage hero (see buildProductPrepaintHtml).
      preloadData: p,
      preloadKey: "__PRELOADED_PRODUCT__",
      prepaintHtml: buildProductPrepaintHtml(image),
    };
  }

  if (parts[0] === "category" && parts[1]) {
    return buildCategoryMeta({ categorySlug: parts[1], subcategorySlug: parts[2], isHindi: false });
  }

  // Hindi category/subcategory pages. Deliberately calls the SAME shared
  // builder with isHindi:true rather than re-reading parts[] with its own
  // offsets here -- the English branch above is parts[1]=categorySlug,
  // parts[2]=subcategorySlug, but under the "hi" prefix everything shifts
  // one index over (parts[0]="hi", parts[1]="category", parts[2]=
  // categorySlug, parts[3]=subcategorySlug). A second copy of this block
  // naively adapted from the English one would be exactly the kind of
  // subtle, easy-to-miss bug this comment exists to prevent -- confirmed
  // against the product branch's own near-miss of this same category of
  // mistake during this same round of work.
  if (parts[0] === "hi" && parts[1] === "category" && parts[2]) {
    return buildCategoryMeta({ categorySlug: parts[2], subcategorySlug: parts[3], isHindi: true });
  }

  if (parts[0] === "policies" && parts[1]) {
    const data = await fetchJson(`${API_BASE}/api/pages/${parts[1]}`);

    if (!data.success || !data.page) return null;

    const page = data.page;
    const url = `${SITE_URL}/policies/${parts[1]}`;
    const breadcrumbItems = [{ name: "Home", path: "/" }, { name: page.title }];

    return {
      title: page.title,
      // Was slicing the raw, unstripped HTML (page.content) straight into
      // the meta description -- a policy page starting with so much as a
      // leading <p> showed a literal "<p>" in the search snippet. Found
      // while adding real body content below (2026-10-02).
      description: truncateAtWordBoundary(stripHtml(page.content) || page.title),
      image: DEFAULT_IMAGE,
      url,
      ogType: "website",
      jsonLd: buildBreadcrumbJsonLd(breadcrumbItems),
      bodyHtml: buildRichContentBodyHtml(breadcrumbItems, page.title, page.content),
    };
  }

  if (path === "/contact") {
    // Contact.jsx's client-side render carries a HomeGoodsStore/@id
    // sameAs-homepage JSON-LD block (added after an earlier audit found
    // this page's own address/phone data was fetched and displayed but
    // never structured) -- this STATIC_PAGES entry never got that same
    // treatment, so a bot hitting /contact (routed here, never to the
    // real React app) saw only a breadcrumb, no business schema at all.
    const staticPage = STATIC_PAGES["/contact"];
    const settingsData = await fetchJson(`${API_BASE}/api/settings`);
    const settings = settingsData.settings || {};

    const localBusinessJsonLd = buildLocalBusinessJsonLd(settings, {
      postalCode: "201012",
    });

    const contactBreadcrumbItems = [{ name: "Home", path: "/" }, { name: staticPage.breadcrumb }];
    // A bit richer than buildSimpleBodyHtml's single paragraph -- the
    // real address/phone are genuinely useful local-SEO content, not
    // just filler, and settings.address is already fetched for the
    // JSON-LD above anyway.
    const contactBodyHtml = `
      <nav aria-label="breadcrumb">${buildBreadcrumbHtml(contactBreadcrumbItems)}</nav>
      <h1>${escapeHtml(staticPage.title)}</h1>
      <p>${escapeHtml(staticPage.description)}</p>
      ${settings.address ? `<p>${escapeHtml(settings.address)}</p>` : ""}
      ${settings.phone ? `<p>Phone: ${escapeHtml(settings.phone)}</p>` : ""}
      ${settings.email ? `<p>Email: ${escapeHtml(settings.email)}</p>` : ""}
    `;

    return {
      title: withBrandSuffix(staticPage.title),
      description: staticPage.description,
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}${path}`,
      ogType: "website",
      jsonLd: [
        buildBreadcrumbJsonLd(contactBreadcrumbItems),
        localBusinessJsonLd,
      ].filter(Boolean),
      bodyHtml: contactBodyHtml,
    };
  }

  if (path === "/ghaziabad-home-furnishing-store") {
    // Mirrors GhaziabadStore.jsx's localBusinessJsonLd exactly -- a
    // dedicated local-SEO landing page, unconditional (not gated on
    // settings.address like Home.jsx/Contact.jsx's blocks) since the
    // landmark-based address here is hardcoded content, not admin data.
    const staticPage = STATIC_PAGES["/ghaziabad-home-furnishing-store"];
    const settingsData = await fetchJson(`${API_BASE}/api/settings`);
    const settings = settingsData.settings || {};

    const localBusinessJsonLd = buildLocalBusinessJsonLd(settings, {
      streetAddress: "Near Vanasthali Public School, Sector 3, Vasundhara",
      postalCode: "201012",
      includeAreaServed: true,
    });

    const ghaziabadBreadcrumbItems = [{ name: "Home", path: "/" }, { name: staticPage.breadcrumb }];
    // Richest page to give real local-SEO body content to -- it's
    // specifically a local-intent landing page (see
    // [[seo_visibility_diagnostic_2026-10-01]] on local-intent terms
    // being the site's actual working opportunity), so the delivery-area
    // list is genuine, relevant content here, not filler.
    const ghaziabadBodyHtml = `
      <nav aria-label="breadcrumb">${buildBreadcrumbHtml(ghaziabadBreadcrumbItems)}</nav>
      <h1>${escapeHtml(staticPage.title)}</h1>
      <p>${escapeHtml(staticPage.description)}</p>
      <p>Near Vanasthali Public School, Sector 3, Vasundhara, Ghaziabad, Uttar Pradesh 201012</p>
      <p>24-hour delivery available in:</p>
      <ul>
        ${DELIVERY_AREAS.map((area) => `<li>${escapeHtml(area)}, Ghaziabad</li>`).join("\n")}
      </ul>
    `;

    return {
      title: withBrandSuffix(staticPage.title),
      description: staticPage.description,
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}${path}`,
      ogType: "website",
      jsonLd: [localBusinessJsonLd, buildBreadcrumbJsonLd(ghaziabadBreadcrumbItems)],
      bodyHtml: ghaziabadBodyHtml,
    };
  }

  if (path === "/articles" || path === "/hi/articles") {
    // Pulled out of the generic STATIC_PAGES branch below (same move
    // already made for /contact and /ghaziabad-home-furnishing-store
    // above) -- this is a real listing of 24 published articles, not a
    // static page with nothing else to say, and needs the real <ul> of
    // links a bot can follow (see buildArticleListBodyHtml's comment --
    // a live GSC check, 2026-10-09, confirmed the old thin body was
    // exactly why this page was "Crawled - currently not indexed").
    const isHindi = path === "/hi/articles";
    const staticPage = STATIC_PAGES[path];
    const staticBreadcrumbItems = [{ name: isHindi ? "होम" : "Home", path: isHindi ? "/hi" : "/" }, { name: staticPage.breadcrumb }];

    const articlesData = await fetchJson(`${API_BASE}/api/articles`);
    // Same rule Articles.jsx already applies client-side: a Hindi listing
    // only shows articles that actually have Hindi content.
    const articles = (articlesData.articles || []).filter((a) => !isHindi || a.titleHi);

    // Matches Articles.jsx's real on-page intro exactly (not the meta
    // description duplicated as body copy, which is what the old
    // STATIC_PAGES-driven body did).
    const intro = isHindi
      ? "सही घरेलू साज-सज्जा चुनने में मदद करने वाली खरीदारी गाइड और स्टाइलिंग टिप्स।"
      : "Buying guides and styling tips to help you choose the right home furnishing.";

    // "/articles" and "/hi/articles" are the one real URL pair among
    // STATIC_PAGES (every other entry here has no Hindi counterpart at
    // all) -- individual article pages already declare this correctly
    // (see parts[0] === "articles" below); the listing pages never did,
    // so bots saw zero declared relationship between the two despite
    // the per-article pages getting it right.
    const articleListingAlternates = [
      { lang: "en", url: `${SITE_URL}/articles` },
      { lang: "hi", url: `${SITE_URL}/hi/articles` },
      { lang: "x-default", url: `${SITE_URL}/articles` },
    ];

    return {
      title: withBrandSuffix(staticPage.title),
      description: staticPage.description,
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}${path}`,
      ogType: "website",
      lang: staticPage.lang,
      alternateLangs: articleListingAlternates,
      jsonLd: buildBreadcrumbJsonLd(staticBreadcrumbItems),
      bodyHtml: buildArticleListBodyHtml(staticBreadcrumbItems, staticPage.title, intro, articles, isHindi),
    };
  }

  if (STATIC_PAGES[path]) {
    const staticPage = STATIC_PAGES[path];
    const staticBreadcrumbItems = [{ name: "Home", path: "/" }, { name: staticPage.breadcrumb }];

    return {
      title: withBrandSuffix(staticPage.title),
      description: staticPage.description,
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}${path}`,
      ogType: "website",
      lang: staticPage.lang,
      jsonLd: [buildBreadcrumbJsonLd(staticBreadcrumbItems), ...(staticPage.extraJsonLd || [])],
      bodyHtml: buildSimpleBodyHtml(staticBreadcrumbItems, staticPage.title, staticPage.description),
    };
  }

  if (parts[0] === "articles" && parts[1]) {
    const data = await fetchJson(`${API_BASE}/api/articles/slug/${parts[1]}`);

    if (!data.success) return null;

    const article = data.article;
    const image = article.coverImage ? imgUrl(article.coverImage) : DEFAULT_IMAGE;
    const url = `${SITE_URL}/articles/${article.slug}`;
    const hasHindi = Boolean(article.titleHi);
    const hiUrl = `${SITE_URL}/hi/articles/${article.slug}`;

    const breadcrumbItems = [
      { name: "Home", path: "/" },
      { name: "Guides & Ideas", path: "/articles" },
      { name: article.title },
    ];

    return {
      title: `${article.title} | ${SITE_NAME}`,
      description: truncateAtWordBoundary(article.excerpt || article.title),
      image,
      url,
      ogType: "article",
      lang: "en",
      // Only advertised once a Hindi version actually exists — otherwise
      // this would hreflang-link to a URL that just redirects right back.
      alternateLangs: hasHindi
        ? [
            { lang: "en", url },
            { lang: "hi", url: hiUrl },
            { lang: "x-default", url },
          ]
        : undefined,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.excerpt,
          image,
          datePublished: article.createdAt,
          dateModified: article.updatedAt,
          inLanguage: "en",
          author: { "@type": "Organization", name: SITE_NAME },
          // Mirrors ArticleDetail.jsx's publisher.logo requirement.
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            logo: {
              "@type": "ImageObject",
              url: `${SITE_URL}/icon-512.png`,
            },
          },
        },
        buildBreadcrumbJsonLd(breadcrumbItems),
      ],
      bodyHtml: buildRichContentBodyHtml(breadcrumbItems, article.title, article.content),
    };
  }

  if (parts[0] === "hi" && parts[1] === "articles" && parts[2]) {
    const data = await fetchJson(`${API_BASE}/api/articles/slug/${parts[2]}`);

    if (!data.success) return null;

    const article = data.article;
    const enUrl = `${SITE_URL}/articles/${article.slug}`;

    // No Hindi content authored for this article — same rule the client
    // route enforces (see ArticleDetail.jsx): a /hi/ URL only exists once
    // there's real Hindi content to serve there, otherwise redirect a
    // crawler straight to the real (English) page instead of a 404 or a
    // soft-404-looking English-under-a-Hindi-URL page.
    if (!article.titleHi) {
      return { redirect: enUrl };
    }

    const image = article.coverImage ? imgUrl(article.coverImage) : DEFAULT_IMAGE;
    const hiUrl = `${SITE_URL}/hi/articles/${article.slug}`;

    const breadcrumbItems = [
      { name: "होम", path: "/" },
      { name: "गाइड और आइडिया", path: "/hi/articles" },
      { name: article.titleHi },
    ];

    return {
      title: `${article.titleHi} | ${SITE_NAME}`,
      description: truncateAtWordBoundary(article.excerptHi || article.excerpt || article.titleHi),
      image,
      url: hiUrl,
      ogType: "article",
      lang: "hi",
      alternateLangs: [
        { lang: "en", url: enUrl },
        { lang: "hi", url: hiUrl },
        { lang: "x-default", url: enUrl },
      ],
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.titleHi,
          description: article.excerptHi || article.excerpt,
          image,
          datePublished: article.createdAt,
          dateModified: article.updatedAt,
          inLanguage: "hi",
          author: { "@type": "Organization", name: SITE_NAME },
          // Mirrors ArticleDetail.jsx's publisher.logo requirement.
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            logo: {
              "@type": "ImageObject",
              url: `${SITE_URL}/icon-512.png`,
            },
          },
        },
        buildBreadcrumbJsonLd(breadcrumbItems),
      ],
      // Falls back to the English content if contentHi was never filled
      // in (titleHi/excerptHi existing doesn't guarantee the full body
      // was translated too) -- better than an empty body under a Hindi
      // URL.
      bodyHtml: buildRichContentBodyHtml(
        breadcrumbItems,
        article.titleHi,
        article.contentHi || article.content,
      ),
    };
  }

  // Private/transactional/admin routes: the real SPA always renders its
  // own <Seo noindex /> tag for every one of these (confirmed across
  // client/src/pages/*) -- robots.txt's own comment documents the
  // intent explicitly: a crawler is MEANT to see a normal 200 page with
  // that tag, same as a real visitor, not be turned away. Without this
  // branch every one of these fell through to the generic `return null`
  // below, which the handler turns into a hard 404 -- confirmed live via
  // curl. Net indexing effect is the same either way (none of these were
  // ever going to be indexed), but a 404 for a perfectly working route is
  // a bot-vs-user status mismatch that risks false "Not Found" noise in
  // Search Console, and silently repeats for any future private route
  // added without its own dedicated buildMeta branch.
  const NOINDEX_ONLY_PATH_PATTERNS = [
    /^\/cart$/,
    /^\/checkout$/,
    /^\/account$/,
    /^\/addresses(\/.*)?$/,
    /^\/wishlist$/,
    /^\/compare$/,
    /^\/login$/,
    /^\/register$/,
    /^\/forgot-password$/,
    /^\/reset-password\/.*$/,
    /^\/newsletter\/unsubscribe$/,
    /^\/change-password$/,
    /^\/loyalty-history$/,
    /^\/edit-profile$/,
    /^\/my-orders(\/.*)?$/,
    /^\/tickets(\/.*)?$/,
    /^\/returns$/,
    /^\/notifications$/,
    /^\/search$/,
    /^\/price\/.*$/,
    /^\/admin(\/.*)?$/,
  ];

  if (NOINDEX_ONLY_PATH_PATTERNS.some((re) => re.test(path))) {
    return {
      title: SITE_NAME,
      description: "",
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}${path}`,
      ogType: "website",
      noindex: true,
    };
  }

  return null;
};

// Same bot-detection regex as vercel.json's `has` rewrite conditions and
// client/middleware.js's BOT_USER_AGENT — kept identical across all
// three by convention (see middleware.js's own comment on this). Needed
// HERE too now that product pages route real users to this same
// function as well (see vercel.json): the vercel.json `has` condition
// that used to gate bots vs real users at the routing layer no longer
// does that job for product pages, so this function has to tell them
// apart itself to decide whether bodyHtml is safe to inject.
// Baiduspider added (deep bug sweep, 2026-10-19) -- unlike every other
// crawler listed here, its name contains neither "bot"/"Bot" nor any
// other already-matched token, so it fell through entirely: for
// category/product pages (routed to every visitor, not just bots) it
// got the prepaintHtml-only real-user path instead of real bodyHtml --
// a non-JS crawler seeing a near-empty #root, the exact soft-404 risk
// this whole bot/real-user split exists to prevent. Keep this string
// identical across render.js/middleware.js/vercel.json (all 3 are
// confirmed in sync as of this fix).
const BOT_USER_AGENT_RE =
  /([bB]ot|Google|facebookexternalhit|WhatsApp|Pinterest|embedly|Quora Link Preview|Slurp|ia_archiver|Discordbot|TelegramBot|redirectionio|[Cc]hat[Gg][Pp][Tt]-[Uu]ser|[Pp]erplexity-[Uu]ser|[Cc]laude-[Uu]ser|[Mm]eta-[Ee]xternal[Aa]gent|Bytespider|[Aa]nthropic-[Aa][Ii]|[Cc]ohere-[Aa][Ii]|Baiduspider)/;

const injectMeta = (html, meta, isBot) => {
  let result = html;

  // Bots never execute JS, so this whole block (title/meta/og/canonical/
  // hreflang/JSON-LD) is the ONLY version of these tags they ever see,
  // same as before this file started also routing real users here (for
  // product pages). A real browser must NOT get this same string
  // injected server-side: react-helmet-async (Seo.jsx) sets every one of
  // these tags client-side already, the exact same way every other page
  // on the site always has, and it has no mechanism to find/remove a
  // pre-existing tag it didn't render itself — a server-injected
  // <title> here plus Helmet's own <title> once React mounts is exactly
  // the site-wide duplicate-<title> bug fixed in PR #290, just
  // reintroduced through a new path. Real users instead get ONLY
  // prepaintHtml/preloadData below — the actual <head> tags are left
  // untouched for Helmet to set, same as it always has.
  if (isBot) {
    const tags = `
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta property="og:type" content="${meta.ogType}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="${meta.lang === "hi" ? "hi_IN" : "en_US"}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${escapeHtml(meta.image)}" />
    <meta property="og:image:alt" content="${escapeHtml(meta.title)}" />
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    <link rel="canonical" href="${escapeHtml(meta.url)}" />
    ${meta.noindex ? '<meta name="robots" content="noindex, nofollow" />' : ""}
    ${
      meta.alternateLangs
        ? meta.alternateLangs
            .map(
              ({ lang, url }) =>
                `<link rel="alternate" hreflang="${escapeHtml(lang)}" href="${escapeHtml(url)}" />`,
            )
            .join("\n    ")
        : ""
    }
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${escapeHtml(meta.image)}" />
    ${meta.jsonLd ? `<script type="application/ld+json">${safeJsonLdStringify(meta.jsonLd)}</script>` : ""}
  `;

    result = result
      .replace(/<title>.*?<\/title>/i, "")
      .replace(/<meta name="description"[^>]*>/i, "")
      .replace("</head>", `${tags}\n  </head>`);

    // Bots never execute JS, so content placed INSIDE #root is simply
    // what they read — no React ever mounts to reconcile against it.
    if (meta.bodyHtml) {
      result = result.replace(
        '<div id="root"></div>',
        `<div id="root">${meta.bodyHtml}</div>`,
      );
    }
  } else {
    // Real browser: client/src/main.jsx mounts React via
    // createRoot(#root).render(), which does NOT clear pre-existing
    // children of its container on first commit — anything placed
    // INSIDE #root here would survive as orphaned, duplicate markup
    // sitting next to (not replaced by) the real client-rendered page
    // (see scripts/build-home-html.mjs's header comment, which this
    // mirrors). prepaintHtml is built specifically to go OUTSIDE #root
    // as a sibling instead, same as the homepage hero placeholder — the
    // page's own component removes it via useLayoutEffect on mount.
    if (meta.prepaintHtml) {
      result = result.replace(
        '<div id="root"></div>',
        `${meta.prepaintHtml}\n    <div id="root"></div>`,
      );
    }

    // Lets the client skip its own redundant fetch for data this
    // function already fetched to build the meta tags above — see each
    // preloadData-producing branch's own comment for which global this
    // lands on. safeJsonLdStringify's "<" escaping guards the same
    // stored-XSS vector a review's text could hit in the JSON-LD script
    // above (a raw "</script>" sequence inside product/description text
    // would otherwise close this tag early).
    if (meta.preloadData) {
      // meta.preloadKey is always one of this file's own hardcoded
      // constants (e.g. "__PRELOADED_PRODUCT__"), never derived from
      // request/API data -- safe to interpolate as a bare identifier.
      result = result.replace(
        "</head>",
        `<script>window.${meta.preloadKey} = ${safeJsonLdStringify(meta.preloadData)};</script>\n  </head>`,
      );
    }
  }

  if (meta.lang) {
    result = result.replace(/<html([^>]*)>/i, (fullMatch, attrs) => {
      const withoutLang = attrs.replace(/\s*lang="[^"]*"/i, "");
      return `<html${withoutLang} lang="${escapeHtml(meta.lang)}">`;
    });
  }

  return result;
};

export default async function handler(req, res) {
  const rawPath = (req.query.path || "/").toString();
  // vercel.json's category rewrite destination ("/category/:slug/:subslug*")
  // leaves a literal trailing "/" when there's no subcategory segment —
  // strip it here (once, for every branch) rather than patching each
  // consumer, so a stray slash never leaks into a canonical URL again.
  const path =
    rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

  // Product pages route BOTH bots and real users here now (see
  // vercel.json) -- every other page type still only ever reaches this
  // function via a bot-gated rewrite, so isBot is always true for them
  // and this check is a no-op. Tells injectMeta whether it's safe to put
  // bodyHtml inside #root (bots only, see that function's own comment).
  const isBot = BOT_USER_AGENT_RE.test(req.headers["user-agent"] || "");
  // This function now returns a genuinely different body for the same
  // URL depending on isBot (bot gets bodyHtml-in-#root, real user gets a
  // sibling prepaint + preloaded data instead) -- Vary tells any cache
  // (Vercel's edge CDN included) to key on User-Agent too, not just the
  // URL, or a bot's cached response could be served to a real browser
  // (reintroducing the exact orphaned-duplicate-content bug this whole
  // split exists to avoid) or vice versa.
  res.setHeader("Vary", "User-Agent");

  const origin = `https://${req.headers.host}`;
  // Was a bare, un-timed-out, un-caught fetch -- every OTHER network call
  // in this file (fetchJson above) has a 6s timeout specifically to fail
  // fast into its own catch rather than hang/throw uncaught. This one had
  // neither, and sat OUTSIDE the try block below, so any transient
  // failure (DNS blip, cold-start lag, an unexpected Host header) threw
  // past the whole handler as a raw, unhandled 500 with zero HTML --
  // exactly the "no fallback" failure mode every other code path here
  // exists to avoid. The catch block below also falls back to this same
  // shellHtml on ITS OWN failures, so a minimal hardcoded shell is kept
  // here too, for when even this fetch can't succeed.
  let shellHtml;
  try {
    const res = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(6000) });
    shellHtml = await res.text();
  } catch (shellError) {
    console.error("Bot prerender shell fetch error:", shellError);
    shellHtml =
      '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div></body></html>';
  }

  try {
    const meta = await buildMeta(path, {
      size: typeof req.query.size === "string" ? req.query.size.slice(0, 50) : undefined,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    // A /hi/articles/:slug for an article with no Hindi content yet —
    // send the crawler straight to the real (English) page with a real
    // 301, the same outcome the client route reaches via <Navigate>.
    if (meta?.redirect) {
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.redirect(301, meta.redirect);
      return;
    }

    if (!meta) {
      // A confidently-resolved "doesn't exist" (product/category/article
      // genuinely not found via the API, not a network hiccup — see catch
      // below) must say so with a real 404, not 200. Google was treating
      // the 200-with-generic-shell response as a "Soft 404": it looked
      // like a valid page with no distinguishing content, instead of a
      // clear signal to drop it from the index. Short cache so a
      // since-restored page isn't stuck behind a stale 404 for long.
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      res.status(404).send(shellHtml);
      return;
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    res.status(200).send(injectMeta(shellHtml, meta, isBot));
  } catch (error) {
    console.error("Bot prerender error:", error);

    // Fail open — a plain SPA shell is still a valid page, just without
    // the enriched meta tags this function exists to add. This path
    // fires on a Render.com backend cold-start/timeout (the 6s fetchJson
    // budget, see its own comment) — unlike the two branches above, it
    // never set any Cache-Control header at all, so a degraded, content-
    // free response hit during exactly that kind of transient blip could
    // sit in Vercel's edge cache under its own default policy and keep
    // being served to the NEXT crawl too, long after the backend
    // recovered. no-store means every request -- including a crawler's
    // very next attempt -- gets a genuine fresh try instead of a cached
    // miss (SEO/conversion audit, 2026-10-20).
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(shellHtml);
  }
}
