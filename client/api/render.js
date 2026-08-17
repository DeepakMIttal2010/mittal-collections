// Serves crawlers (Googlebot, WhatsApp, Facebook, Twitter, etc.) a version
// of index.html with the real product/category title, description, OG tags
// and JSON-LD already in place — this is a client-side-rendered SPA, so the
// plain HTML response every bot sees by default is just the generic site
// shell, which is what was showing up in Search Console snippets and
// WhatsApp/Facebook link previews instead of the actual product.
//
// Routed here only for known bot user-agents (see vercel.json `has` rules);
// real visitors always get the normal SPA and never touch this function.

const SITE_NAME = "Mittal Collections";
const SITE_URL = "https://www.mittalcollections.com";
const API_BASE =
  process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com";
const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200";

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

const buildMeta = async (path) => {
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "product" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/products/${parts[1]}`).then(
      (r) => r.json(),
    );

    if (!data.success) return null;

    const p = data.product;
    const description = p.description
      ? p.description.slice(0, 160)
      : `Buy ${p.name} at Mittal Collections`;
    const image = imgUrl(p.image) || DEFAULT_IMAGE;
    const url = `${SITE_URL}${path}`;

    return {
      title: `${p.name} | ${SITE_NAME}`,
      description,
      image,
      url,
      ogType: "product",
      jsonLd: {
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
    };
  }

  if (parts[0] === "category" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/categories`).then((r) =>
      r.json(),
    );

    if (!data.success) return null;

    const category = data.categories?.find((c) => c.slug === parts[1]);
    if (!category) return null;

    const url = `${SITE_URL}${path}`;

    return {
      title: `${category.name} | ${SITE_NAME}`,
      description:
        category.description || `Shop ${category.name} at ${SITE_NAME}`,
      image: imgUrl(category.image) || DEFAULT_IMAGE,
      url,
      ogType: "website",
      jsonLd: null,
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
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${escapeHtml(meta.image)}" />
    ${meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>` : ""}
  `;

  return html
    .replace(/<title>.*?<\/title>/i, "")
    .replace(/<meta name="description"[^>]*>/i, "")
    .replace("</head>", `${tags}\n  </head>`);
};

export default async function handler(req, res) {
  const path = (req.query.path || "/").toString();

  const origin = `https://${req.headers.host}`;
  const shellHtml = await fetch(`${origin}/index.html`).then((r) => r.text());

  try {
    const meta = await buildMeta(path);

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (!meta) {
      // A confidently-resolved "doesn't exist" (product/category genuinely
      // not found via the API, not a network hiccup — see catch below)
      // must say so with a real 404, not 200. Google was treating the
      // 200-with-generic-shell response as a "Soft 404": it looked like a
      // valid page with no distinguishing content, instead of a clear
      // signal to drop it from the index. Short cache so a since-restored
      // product isn't stuck behind a stale 404 for long.
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
