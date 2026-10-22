// Optional per-page search copy for category and subcategory landing
// pages, editable from the admin forms. Empty means "use the generated
// default" (title "<Name> | Mittal Collections", meta description built
// from the description/subtitle) -- so nothing changes for a page until
// someone writes copy for it.
//
// aboutText is the longer "About ..." section shown under the product
// grid (plain text, blank line between paragraphs): real, page-specific
// text for a query like "tulip comforter double bed price" instead of a
// grid of product cards and one sentence.
const text = (maxlength) => ({ type: String, default: "", trim: true, maxlength });

export const SEO_FIELD_NAMES = ["seoTitle", "seoTitleHi", "seoDescription", "seoDescriptionHi", "aboutText", "aboutTextHi"];

export const seoFieldsSchema = {
  seoTitle: text(80),
  seoTitleHi: text(80),
  seoDescription: text(200),
  seoDescriptionHi: text(200),
  aboutText: text(4000),
  aboutTextHi: text(4000),
};

// Picks the SEO fields present in a request body (multipart sends
// strings; anything else is ignored).
export const pickSeoFields = (body = {}) =>
  Object.fromEntries(
    SEO_FIELD_NAMES.filter((k) => typeof body[k] === "string").map((k) => [k, body[k]]),
  );
