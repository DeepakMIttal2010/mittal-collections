// Blocks javascript:/data:/vbscript: URIs (and any other unexpected
// scheme) on admin-authored link fields — Banner button links, Footer
// links — that render straight into an <a href> with no further
// sanitization (unlike Article content, which goes through
// sanitizeArticleContent.js's full HTML allowlist). A relative path
// ("/products/some-slug"), a same-page anchor ("#shop-categories" —
// the existing Hero banners' own "View All Categories" button uses
// exactly this), or one of the handful of legitimate external schemes
// is let through unchanged.
const SAFE_SCHEMES = /^(https?:|mailto:|tel:)/i;

export const isSafeLinkUrl = (url) => {
  if (!url) return true;
  if (url.startsWith("/") || url.startsWith("#")) return true;
  return SAFE_SCHEMES.test(url);
};
