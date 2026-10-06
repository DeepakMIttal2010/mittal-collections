import DOMPurify from "dompurify";

// Belt-and-suspenders alongside the server-side sanitizeArticleContent.js
// (server/utils/sanitizeArticleContent.js) — same reasoning as
// sanitizeDescriptionHtml.js's identical comment: server-side sanitization
// on save can't be proven to have run on every value that could ever
// reach this render path (an API response is an untrusted remote source
// from the client's point of view), and any article saved before the
// server-side fix shipped would still carry unsanitized HTML in Mongo
// today with nothing else guarding its render.
//
// Same tag/attribute allowlist as the server side (matches exactly what
// the Quill toolbar in AdminArticleForm.jsx can produce) — keep both in
// sync if the toolbar ever changes.
const ALLOWED_TAGS = [
  "p",
  "br",
  "h2",
  "h3",
  "strong",
  "em",
  "u",
  "ol",
  "ul",
  "li",
  "a",
  "img",
];

const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt"];

export const sanitizeArticleHtml = (html) =>
  DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
