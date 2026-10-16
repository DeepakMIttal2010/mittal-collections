import sanitizeHtml from "sanitize-html";

// Product descriptions are authored in the admin panel via a Quill
// editor (client/src/pages/admin/AddProduct.jsx /
// EditProduct.jsx's descriptionModules) and rendered back out on
// ProductDetails.jsx via dangerouslySetInnerHTML with no sanitization
// anywhere in that pipeline — same stored-XSS shape
// sanitizeArticleContent.js already exists to close for Articles (any
// account with product-write permission, or a compromised admin
// session, could inject a payload that runs in every visitor's
// browser). Sanitizing here on write means every consumer — the
// product page, the Shopping/Meta feed, any future export — inherits
// the fix for free.
//
// Narrower allowlist than Article content on purpose: the product
// description toolbar only offers bold/italic/lists (no links,
// images, or headers), so nothing else should ever legitimately reach
// the database here. Extend both together if the toolbar ever changes.
const ALLOWED_TAGS = ["p", "br", "strong", "em", "ol", "ul", "li"];

// Built from the char code, not a literal character, for the same
// reason sanitizeArticleContent.js's own copy of this pattern is — see
// that file's comment for the full story (Quill converts plain spaces
// to nbsp when loading existing HTML into the editor for a re-save,
// which makes a long run of words unbreakable and overflows its
// container). Confirmed live in PRODUCT descriptions too, 2026-10-16
// (4 Diwan Bedsheet products, every space replaced) — this sanitizer
// was never given the same fix when the article one was, despite
// sharing the identical Quill-editor-round-trip root cause.
const NBSP_PATTERN = new RegExp(String.fromCharCode(160), "g");

export const sanitizeProductDescription = (html) =>
  sanitizeHtml(html || "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    textFilter: (text) => text.replace(NBSP_PATTERN, " "),
  });
