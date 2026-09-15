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
  "/gifting",
  "/rewards",
  "/about",
  "/contact",
  "/articles",
  "/hi/articles",
  "/curtain-size-calculator",
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

// A plain `?limit=1000` call silently truncates past 1000 products —
// getProducts only returns `hasMore`/pagination metadata once a `page`
// param is sent (see productController.js's isPaginated branch), so
// this walks pages until the catalog is exhausted instead of trusting
// a single request to return everything.
const PRODUCTS_PAGE_SIZE = 500;

const fetchAllProducts = async () => {
  const products = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchJson(
      `${API_BASE}/api/products?page=${page}&limit=${PRODUCTS_PAGE_SIZE}`,
    );

    products.push(...data.products);
    hasMore = Boolean(data.hasMore);
    page += 1;
  }

  return products;
};

// `alternates` (only ever used for articles with a Hindi version) tells
// Google the English and Hindi URLs are translations of each other
// rather than separate/duplicate pages — same purpose as the hreflang
// <link> tags render.js adds for a crawler that lands via prerender.
const urlEntry = (loc, alternates) => {
  const altLinks = alternates
    ? alternates
        .map(
          ({ lang, href }) =>
            `<xhtml:link rel="alternate" hreflang="${lang}" href="${SITE_URL}${href}"/>`,
        )
        .join("")
    : "";

  return `  <url><loc>${SITE_URL}${loc}</loc>${altLinks}</url>`;
};

export default async function handler(req, res) {
  const urls = [...STATIC_ROUTES.map((loc) => urlEntry(loc))];

  try {
    const [categoriesRes, subcategoriesRes, products, articlesRes, pagesRes] =
      await Promise.all([
        fetchJson(`${API_BASE}/api/categories`),
        fetchJson(`${API_BASE}/api/subcategories`),
        fetchAllProducts(),
        fetchJson(`${API_BASE}/api/articles`),
        fetchJson(`${API_BASE}/api/pages`),
      ]);

    (pagesRes.pages || []).forEach((p) => urls.push(urlEntry(`/policies/${p.slug}`)));

    // /price/:maxPrice filter pages are deliberately excluded — they're
    // near-duplicate faceted views of the same small catalog, not unique
    // content worth Google's crawl budget (found while auditing GSC's
    // "Discovered – currently not indexed" report, 2026-08-10). The pages
    // themselves still work; they're just not advertised in the sitemap.
    categoriesRes.categories.forEach((c) => urls.push(urlEntry(`/category/${c.slug}`)));
    (subcategoriesRes.subcategories || []).forEach((s) => {
      if (s.category?.slug) urls.push(urlEntry(`/category/${s.category.slug}/${s.slug}`));
    });
    products.forEach((p) => urls.push(urlEntry(productUrl(p))));

    // A Hindi version is only advertised (and only gets its own sitemap
    // entry) once titleHi is actually filled in — see Article.js and
    // ArticleDetail.jsx's own comments on why an untranslated /hi/ URL
    // shouldn't exist as far as Google's concerned.
    articlesRes.articles.forEach((a) => {
      const enPath = `/articles/${a.slug}`;

      if (!a.titleHi) {
        urls.push(urlEntry(enPath));
        return;
      }

      const hiPath = `/hi/articles/${a.slug}`;
      const alternates = [
        { lang: "en", href: enPath },
        { lang: "hi", href: hiPath },
        { lang: "x-default", href: enPath },
      ];

      urls.push(urlEntry(enPath, alternates));
      urls.push(urlEntry(hiPath, alternates));
    });
  } catch (error) {
    console.error("Sitemap generation error, serving static routes only:", error);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.status(200).send(xml);
}
