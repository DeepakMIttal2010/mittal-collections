import DOMPurify from "dompurify";

// Belt-and-suspenders alongside the server-side sanitizeProductDescription.js
// (server/utils/sanitizeProductDescription.js) — that one sanitizes on
// save, this one sanitizes again right before dangerouslySetInnerHTML
// renders it. Needed even with the server-side fix in place: from a
// static analyzer's point of view (and from a defense-in-depth one),
// data fetched from an API response is an untrusted remote source, and
// nothing here can prove the server-side sanitizer ran on every value
// that could ever reach this render path.
//
// Same tag allowlist as the server side (the product description
// toolbar only offers bold/italic/lists) — keep both in sync if the
// toolbar ever changes.
const ALLOWED_TAGS = ["p", "br", "strong", "em", "ol", "ul", "li"];

export const sanitizeDescriptionHtml = (html) =>
  DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
  });
