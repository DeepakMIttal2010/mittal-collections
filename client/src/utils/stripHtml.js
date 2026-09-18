// Product descriptions are now authored as rich-text HTML (see
// AddProduct.jsx/EditProduct.jsx's ReactQuill fields) but several
// places still need a plain-text version — SEO meta descriptions and
// the "read more" length check can't work against raw markup, and
// showing stray <p>/<li> tags in a meta tag or truncation count would
// be a real regression from the plain-textarea days.
export const stripHtml = (html) =>
  (html || "")
    .replace(/<\/(p|li|div|h[1-6])>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
