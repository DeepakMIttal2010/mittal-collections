// Generates sitemap.xml at request time instead of baking it in at deploy
// time. The old approach (a "prebuild" script writing a static
// public/sitemap.xml) meant a product added or removed through the admin
// panel wouldn't show up in — or drop out of — the sitemap until the next
// deploy, which could be days. This fetches the live catalog on every
// request instead, with CDN caching (see the Cache-Control header below)
// so it isn't hammering the API on every single crawl.
//
// Routed here via vercel.json's "/sitemap.xml" rewrite. Deliberately NOT
// also written as a static file in public/ — Vercel serves an exact
// filesystem match ahead of rewrites (see the homepage-bot-prerender note
// in api/render.js for the same gotcha confirmed live), so a leftover
// static sitemap.xml would silently shadow this function.

const SITE_URL = "https://www.mittalcollections.com";
const API_BASE =
  process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com";

const STATIC_ROUTES = [
  "/",
  "/trending",
  "/clearance-sale",
  "/new-arrivals",
  "/about",
  "/contact",
  "/articles",
  "/curtain-size-calculator",
  // Hardcoded rather than fetched — there's no public "list pages" API
  // endpoint (pageRoutes.js only exposes single-slug lookup and an
  // admin-protected list), and these 4 policy pages rarely change.
  "/policies/shipping-policy",
  "/policies/returns",
  "/policies/privacy-policy",
  "/policies/terms-and-conditions",
];

const fetchJson = async (url) => {
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

  return res.json();
};

const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const productUrl = (p) => {
  const slug = p.slug || slugify(p.name || "");
  return slug ? `/product/${p._id}/${slug}` : `/product/${p._id}`;
};

const urlEntry = (loc) => `  <url><loc>${SITE_URL}${loc}</loc></url>`;

export default async function handler(req, res) {
  const urls = [...STATIC_ROUTES];

  try {
    const [categoriesRes, subcategoriesRes, productsRes, articlesRes] =
      await Promise.all([
        fetchJson(`${API_BASE}/api/categories`),
        fetchJson(`${API_BASE}/api/subcategories`),
        fetchJson(`${API_BASE}/api/products?limit=1000`),
        fetchJson(`${API_BASE}/api/articles`),
      ]);

    // /price/:maxPrice filter pages are deliberately excluded — they're
    // near-duplicate faceted views of the same small catalog, not unique
    // content worth Google's crawl budget (found while auditing GSC's
    // "Discovered – currently not indexed" report, 2026-08-10). The pages
    // themselves still work; they're just not advertised in the sitemap.
    categoriesRes.categories.forEach((c) => urls.push(`/category/${c.slug}`));
    (subcategoriesRes.subcategories || []).forEach((s) => {
      if (s.category?.slug) urls.push(`/category/${s.category.slug}/${s.slug}`);
    });
    productsRes.products.forEach((p) => urls.push(productUrl(p)));
    articlesRes.articles.forEach((a) => urls.push(`/articles/${a.slug}`));
  } catch (error) {
    console.error("Sitemap generation error, serving static routes only:", error);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(urlEntry).join("\n")}
</urlset>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.status(200).send(xml);
}
