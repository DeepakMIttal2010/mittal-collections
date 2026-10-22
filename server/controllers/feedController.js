import sanitizeHtml from "sanitize-html";
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

// The actual tag removal goes through sanitize-html (a real HTML
// parser), not a hand-rolled regex — a regex like /<[^>]+>/g only ever
// does one pass, so an input crafted like "<scr<script>ipt>" strips
// the inner tag and leaves the outer fragments to reform "<script>"
// (CodeQL flags exactly this as "incomplete multi-character
// sanitization"). The two regexes below only ever INSERT a space at a
// block boundary before that real strip — they never remove anything
// themselves, so they can't be tricked into leaving markup behind.
const stripTags = (html) => {
  const withSpacing = String(html ?? "")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "</$1> ")
    .replace(/<br\s*\/?>/gi, " ");

  return sanitizeHtml(withSpacing, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
};

// Google Shopping / Meta Catalog only want a short, plain-text
// description — strip the multi-paragraph SEO copy down to plain text
// without the trailing "Care instructions:" paragraph, which reads
// oddly out of context in an ad. Descriptions are now authored as rich
// text (see AddProduct.jsx's ReactQuill field), so blocks are HTML
// (<p>/<li> elements) for anything edited since; older, never-touched
// products still store plain text with blank-line-separated
// paragraphs, so both shapes are split into "blocks" here before the
// Care-instructions filter and the final tag-stripping pass.
const feedDescription = (description) => {
  const raw = description || "";
  const isHtml = /<[a-z][\s\S]*>/i.test(raw);

  const blocks = isHtml
    ? raw.split(/<\/(?:p|li|div|h[1-6])>/gi)
    : raw.split(/\r?\n\r?\n/);

  // Some products' final paragraph is labelled "Care instructions:",
  // others just "Care:" — both conventions exist in the catalog (found
  // while bulk-reformatting descriptions into rich text), so both must
  // be recognized here or the shorter-labelled ones silently leak their
  // care paragraph into the Shopping/Meta feed description.
  const withoutCareInstructions = blocks
    .map(stripTags)
    .filter((block) => block && !/^care(\s+instructions)?:/i.test(block))
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
    const products = await Product.find({
      isActive: true,
      visibility: { $ne: "offline" },
      // Same rule the site's own listings use (see getProducts) - a
      // one-off/discontinued product (willRestock: false) that's sold
      // out disappears from the site entirely, so it shouldn't linger
      // in the Shopping feed as an "out of stock" listing indefinitely.
      $or: [{ stock: { $gt: 0 } }, { willRestock: { $ne: false } }],
    })
      .select(
        "name description price oldPrice image images stock variants slug brand category productNumber fabric color pattern",
      )
      .populate("category", "name nameHi");

    const items = products
      .flatMap((product) => {
        const brand = escapeXml(product.brand || BRAND_NAME);
        // Only emit these when actually filled in — an empty <g:color>
        // tag is worse than no tag at all (Merchant Center flags it as
        // an invalid/empty attribute value).
        const colorTag = product.color
          ? `      <g:color>${escapeXml(product.color)}</g:color>\n`
          : "";
        const materialTag = product.fabric
          ? `      <g:material>${escapeXml(product.fabric)}</g:material>\n`
          : "";
        const patternTag = product.pattern
          ? `      <g:pattern>${escapeXml(product.pattern)}</g:pattern>\n`
          : "";
        const extraImages = (product.images || [])
          .filter((url) => url !== product.image)
          .slice(0, 10)
          .map((url) => `      <g:additional_image_link>${escapeXml(url)}</g:additional_image_link>`)
          .join("\n");
        const description = escapeXml(feedDescription(product.description));
        const link = escapeXml(productUrl(product));
        const sharedTags = `      <g:image_link>${escapeXml(product.image)}</g:image_link>
${extraImages}
      <g:condition>new</g:condition>
      <g:brand>${brand}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>${escapeXml(product.category?.name || "")}</g:product_type>
      <g:ships_from_country>IN</g:ships_from_country>
${colorTag}${materialTag}${patternTag}`;

        // A sized product (curtains etc.) used to emit ONE <item>, built
        // entirely from variants[0]'s price/stock -- the 9x4 ft size (or
        // whichever size wasn't variants[0]) was completely invisible to
        // Google Shopping, both in price and in availability. A false
        // "out of stock" the moment variants[0] specifically sold out
        // (while the other size was still purchasable) is a real
        // disapproval/broken-ad risk, not just a missed listing (same
        // root cause as the JSON-LD Offer fix, same audit, 2026-10-20).
        // One <item> per variant, sharing a g:item_group_id, is the
        // standard Shopping-feed pattern for representing size/colour
        // variants of the same product.
        if (product.variants?.length > 1) {
          const usedIds = new Set();

          return product.variants.map((variant, i) => {
            // Unique per variant even if two sizes slugify the same
            // ("7.5x4" / "7-5x4") or a size has no slug-able characters.
            let suffix = slugify(variant.size) || String(i + 1);
            if (usedIds.has(suffix)) suffix = `${suffix}-${i + 1}`;
            usedIds.add(suffix);
            const availability = variant.stock > 0 ? "in stock" : "out of stock";
            // Each variant carries its own oldPrice (see Product.js --
            // different sizes can have different markdowns), not the
            // top-level product.oldPrice -- mirrors ProductDetails.jsx's
            // own displayOldPrice (selectedVariant.oldPrice), same bug
            // class as the price/availability fix above, caught before
            // shipping.
            const salePrice =
              variant.oldPrice > variant.price
                ? `      <g:sale_price>${variant.price.toFixed(2)} INR</g:sale_price>\n`
                : "";
            const listPrice =
              variant.oldPrice > variant.price ? variant.oldPrice : variant.price;

            return `    <item>
      <g:id>${product._id}-${suffix}</g:id>
      <g:item_group_id>${product._id}</g:item_group_id>
      <title>${escapeXml(`${product.name} - ${variant.size}`)}</title>
      <description>${description}</description>
      <link>${escapeXml(`${productUrl(product)}?size=${encodeURIComponent(variant.size)}`)}</link>
${sharedTags}      <g:size>${escapeXml(variant.size)}</g:size>
      <g:availability>${availability}</g:availability>
      <g:price>${listPrice.toFixed(2)} INR</g:price>
${salePrice}    </item>`;
          });
        }

        const availability = product.stock > 0 ? "in stock" : "out of stock";
        const salePrice =
          product.oldPrice > product.price
            ? `      <g:sale_price>${product.price.toFixed(2)} INR</g:sale_price>\n`
            : "";
        const listPrice =
          product.oldPrice > product.price ? product.oldPrice : product.price;

        return [`    <item>
      <g:id>${product._id}</g:id>
      <title>${escapeXml(product.name)}</title>
      <description>${description}</description>
      <link>${link}</link>
${sharedTags}      <g:availability>${availability}</g:availability>
      <g:price>${listPrice.toFixed(2)} INR</g:price>
${salePrice}    </item>`];
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
