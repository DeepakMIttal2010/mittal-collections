import fs from "fs";
import path from "path";

const SITE_URL = "https://www.mittalcollections.com";
const API_URL =
  process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com";

const STATIC_ROUTES = ["/", "/trending", "/about", "/contact"];

const fetchJson = async (url) => {
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

  return res.json();
};

const urlEntry = (loc) =>
  `  <url><loc>${SITE_URL}${loc}</loc></url>`;

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

const buildSitemap = async () => {
  const urls = [...STATIC_ROUTES];

  try {
    const [categoriesRes, productsRes, priceRangesRes] = await Promise.all([
      fetchJson(`${API_URL}/api/categories`),
      fetchJson(`${API_URL}/api/products?limit=1000`),
      fetchJson(`${API_URL}/api/price-ranges`),
    ]);

    categoriesRes.categories.forEach((c) => urls.push(`/category/${c.slug}`));
    productsRes.products.forEach((p) => urls.push(productUrl(p)));
    priceRangesRes.priceRanges.forEach((p) =>
      urls.push(`/price/${p.maxPrice}`),
    );
  } catch (error) {
    console.warn(
      "⚠️  Could not fetch live data for sitemap, writing static routes only:",
      error.message,
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(urlEntry).join("\n")}
</urlset>
`;

  const outPath = path.resolve("public/sitemap.xml");

  fs.writeFileSync(outPath, xml);
  console.log(`✅ sitemap.xml written with ${urls.length} URLs`);
};

buildSitemap();
