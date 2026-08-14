import Product from "../models/Product.js";

const SITE_URL = "https://www.mittalcollections.com";
const BRAND_NAME = "Mittal Collections";

const slugify = (text) =>
  (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const productUrl = (product) => {
  const slug = product.slug || slugify(product.name);
  return slug
    ? `${SITE_URL}/product/${product._id}/${slug}`
    : `${SITE_URL}/product/${product._id}`;
};

// XML-escapes text content — CDATA would be simpler but title/description
// are read by feed validators that sometimes flag CDATA-wrapped required
// fields, so escaping directly is the safer choice for Merchant Center.
const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Google Shopping / Meta Catalog only want a short, clean description —
// strip the multi-paragraph SEO copy down to plain text without the
// trailing "Care instructions:" paragraph, which reads oddly out of
// context in an ad.
const feedDescription = (description) => {
  const withoutCareInstructions = (description || "")
    .split(/\r?\n\r?\n/)
    .filter((para) => !/^care instructions:/i.test(para.trim()))
    .join(" ");

  return withoutCareInstructions.replace(/\s+/g, " ").trim().slice(0, 5000);
};

// ============================
// GOOGLE SHOPPING / META CATALOG PRODUCT FEED (Public)
// ============================
// Serves an RSS 2.0 + Google Shopping namespace feed at a stable public
// URL — Google Merchant Center and Meta Commerce Manager both accept
// this exact format, so one feed covers both. Generated fresh on every
// request rather than cached/pre-built like the sitemap, since the
// catalog is small and both platforms only poll it periodically.
export const getGoogleProductFeed = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .select(
        "name description price oldPrice image images stock slug brand category productNumber",
      )
      .populate("category", "name");

    const items = products
      .map((product) => {
        const price = `${product.price.toFixed(2)} INR`;
        const availability = product.stock > 0 ? "in stock" : "out of stock";
        const brand = escapeXml(product.brand || BRAND_NAME);
        const extraImages = (product.images || [])
          .filter((url) => url !== product.image)
          .slice(0, 10)
          .map((url) => `      <g:additional_image_link>${escapeXml(url)}</g:additional_image_link>`)
          .join("\n");

        return `    <item>
      <g:id>${product._id}</g:id>
      <title>${escapeXml(product.name)}</title>
      <description>${escapeXml(feedDescription(product.description))}</description>
      <link>${escapeXml(productUrl(product))}</link>
      <g:image_link>${escapeXml(product.image)}</g:image_link>
${extraImages}
      <g:availability>${availability}</g:availability>
      <g:price>${price}</g:price>
      <g:condition>new</g:condition>
      <g:brand>${brand}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>${escapeXml(product.category?.name || "")}</g:product_type>
      <g:ships_from_country>IN</g:ships_from_country>
    </item>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${BRAND_NAME} Product Feed</title>
    <link>${SITE_URL}</link>
    <description>Product feed for Google Merchant Center and Meta Catalog</description>
${items}
  </channel>
</rss>
`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(xml);
  } catch (error) {
    console.error("Get Google Product Feed Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
