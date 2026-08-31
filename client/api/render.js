// Serves crawlers (Googlebot, WhatsApp, Facebook, Twitter, etc.) a version
// of index.html with the real product/category/article/homepage title,
// description, OG tags and JSON-LD already in place — this is a
// client-side-rendered SPA, so the plain HTML response every bot sees by
// default is just the generic site shell, which is what was showing up in
// Search Console snippets and WhatsApp/Facebook link previews instead of
// the actual page.
//
// Routed here only for known bot user-agents (see vercel.json `has`
// rules); real visitors always get the normal SPA and never touch this
// function.

const SITE_NAME = "Mittal Collections";
const SITE_URL = "https://www.mittalcollections.com";
const API_BASE =
  process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com";
// TODO: placeholder real-product photo (doormat) picked 2026-08-31 as a
// stand-in for the generic stock photo this used to be — user asked to be
// reminded to swap it for a more representative one later. Mirrors
// client/src/components/Seo.jsx's own DEFAULT_IMAGE.
const DEFAULT_IMAGE =
  "https://res.cloudinary.com/y2gghpvz/image/upload/q_auto,f_auto,w_1200/v1786455968/mittal-collections/eyh3ckt24w8hf7gu3aop.jpg";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const imgUrl = (path) => {
  if (!path) return path;
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
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

const buildMeta = async (path) => {
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) {
    // Homepage — mirrors Home.jsx's <Seo> call and HomeGoodsStore schema.
    // NOTE: unreachable via the real "/" URL in production — Vercel serves
    // the static index.html straight from its filesystem/edge cache for an
    // exact "/" match, which takes precedence over vercel.json's `rewrites`
    // regardless of the bot user-agent `has` condition (confirmed live;
    // /category and /articles don't have this problem since no static file
    // exists at those paths to collide with). Fixing this needs Vercel Edge
    // Middleware instead of a rewrite rule — left as-is for now since a
    // bare-domain share is rare next to a product/category/article link.
    // This branch still works correctly if hit directly via
    // /api/render?path=/, so it's kept rather than removed.
    const settingsData = await fetch(`${API_BASE}/api/settings`).then((r) =>
      r.json(),
    );
    const settings = settingsData.settings || {};

    const jsonLd = settings.address
      ? {
          "@context": "https://schema.org",
          "@type": "HomeGoodsStore",
          "@id": `${SITE_URL}/#business`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          telephone: settings.phone || undefined,
          priceRange: "₹₹",
          address: {
            "@type": "PostalAddress",
            streetAddress: settings.address,
            addressLocality: "Ghaziabad",
            addressRegion: "Uttar Pradesh",
            addressCountry: "IN",
          },
          areaServed: [
            { "@type": "Place", name: "Vasundhara, Ghaziabad" },
            { "@type": "Place", name: "Indirapuram, Ghaziabad" },
            { "@type": "Place", name: "Vaishali, Ghaziabad" },
            { "@type": "City", name: "Ghaziabad" },
          ],
          sameAs: [settings.facebook, settings.instagram, settings.twitter].filter(
            Boolean,
          ),
        }
      : null;

    return {
      title: `Buy Bedsheets, Curtains & Towels Online — Pan-India Delivery | ${SITE_NAME}`,
      description:
        "Shop premium cotton bedsheets, curtains, towels, cushions and doormats online with pan-India delivery — fast 24-hour delivery in Vasundhara, Indirapuram, Vaishali and nearby Ghaziabad. Genuine products, easy returns.",
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}/`,
      ogType: "website",
      jsonLd,
    };
  }

  if (parts[0] === "product" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/products/${parts[1]}`).then(
      (r) => r.json(),
    );

    if (!data.success) return null;

    const p = data.product;
    // Same "pan-India delivery" lead-in ProductDetails.jsx's <Seo> uses —
    // this bot-facing copy had drifted from that client-side convention.
    const description = p.description
      ? `Buy online, pan-India delivery (24hr in Ghaziabad) - ${p.description}`.slice(0, 160)
      : `Buy ${p.name} online with pan-India delivery - fast 24-hour delivery in Ghaziabad`;
    const image = imgUrl(p.image) || DEFAULT_IMAGE;
    // Self-heal to the product's *current* slug rather than echoing back
    // whatever slug the request happened to use — otherwise a renamed
    // product's stale URL (still reachable, since only the id is looked
    // up) canonicalizes to itself instead of the real current URL, which
    // is exactly what produced Search Console's "Duplicate without
    // user-selected canonical" for these pages. Matches the client-side
    // productUrl() helper's own self-healing behaviour.
    const currentSlug = p.slug || parts[2] || "";
    const canonicalPath = currentSlug
      ? `/product/${p._id}/${currentSlug}`
      : `/product/${p._id}`;
    const url = `${SITE_URL}${canonicalPath}`;

    const breadcrumbItems = [
      { name: "Home", path: "/" },
      ...(p.category
        ? [{ name: p.category.name, path: `/category/${p.category.slug}` }]
        : []),
      { name: p.name },
    ];

    return {
      title: `${p.name} | ${SITE_NAME}`,
      description,
      image,
      url,
      ogType: "product",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          description: p.description,
          image,
          brand: { "@type": "Brand", name: SITE_NAME },
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: p.price,
            availability:
              p.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            url,
          },
        },
        buildBreadcrumbJsonLd(breadcrumbItems),
      ],
    };
  }

  if (parts[0] === "category" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/categories`).then((r) =>
      r.json(),
    );

    if (!data.success) return null;

    const category = data.categories?.find((c) => c.slug === parts[1]);
    if (!category) return null;

    // `path` is already trailing-slash-normalized by the caller, so this
    // stays clean instead of picking up the stray "/" that vercel.json's
    // "/category/:slug/:subslug*" rewrite destination leaves behind when
    // there's no subcategory segment.
    const url = `${SITE_URL}${path}`;

    const breadcrumbItems = [
      { name: "Home", path: "/" },
      { name: category.name },
    ];

    return {
      title: `${category.name} | ${SITE_NAME}`,
      // Same "pan-India delivery" lead-in CategoryPage.jsx's <Seo> uses.
      description:
        `Buy ${category.name} online with pan-India delivery at ${SITE_NAME} - fast 24-hour delivery in Ghaziabad. ${category.description || ""}`.trim(),
      image: imgUrl(category.image) || DEFAULT_IMAGE,
      url,
      ogType: "website",
      jsonLd: buildBreadcrumbJsonLd(breadcrumbItems),
    };
  }

  if (parts[0] === "articles" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/articles/slug/${parts[1]}`).then(
      (r) => r.json(),
    );

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
      description: article.excerpt || article.title,
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
          image: article.coverImage ? imgUrl(article.coverImage) : undefined,
          datePublished: article.createdAt,
          dateModified: article.updatedAt,
          inLanguage: "en",
          author: { "@type": "Organization", name: SITE_NAME },
          publisher: { "@type": "Organization", name: SITE_NAME },
        },
        buildBreadcrumbJsonLd(breadcrumbItems),
      ],
    };
  }

  if (parts[0] === "hi" && parts[1] === "articles" && parts[2]) {
    const data = await fetch(`${API_BASE}/api/articles/slug/${parts[2]}`).then(
      (r) => r.json(),
    );

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
      { name: "Home", path: "/" },
      { name: "गाइड और आइडिया", path: "/hi/articles" },
      { name: article.titleHi },
    ];

    return {
      title: `${article.titleHi} | ${SITE_NAME}`,
      description: article.excerptHi || article.excerpt || article.titleHi,
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
          image: article.coverImage ? imgUrl(article.coverImage) : undefined,
          datePublished: article.createdAt,
          dateModified: article.updatedAt,
          inLanguage: "hi",
          author: { "@type": "Organization", name: SITE_NAME },
          publisher: { "@type": "Organization", name: SITE_NAME },
        },
        buildBreadcrumbJsonLd(breadcrumbItems),
      ],
    };
  }

  return null;
};

const injectMeta = (html, meta) => {
  const tags = `
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta property="og:type" content="${meta.ogType}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${escapeHtml(meta.image)}" />
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    <link rel="canonical" href="${escapeHtml(meta.url)}" />
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
    ${meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>` : ""}
  `;

  let result = html
    .replace(/<title>.*?<\/title>/i, "")
    .replace(/<meta name="description"[^>]*>/i, "")
    .replace("</head>", `${tags}\n  </head>`);

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

  const origin = `https://${req.headers.host}`;
  const shellHtml = await fetch(`${origin}/index.html`).then((r) => r.text());

  try {
    const meta = await buildMeta(path);

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
    res.status(200).send(injectMeta(shellHtml, meta));
  } catch (error) {
    console.error("Bot prerender error:", error);

    // Fail open — a plain SPA shell is still a valid page, just without
    // the enriched meta tags this function exists to add.
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(shellHtml);
  }
}
