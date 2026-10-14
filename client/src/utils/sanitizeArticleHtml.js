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

// Built from the char code (not a literal character in this source
// file) so it can never accidentally be "cleaned up" away by a future
// editor pass — same reasoning as sanitizeArticleContent.js's own copy
// of this constant.
const NBSP_PATTERN = new RegExp(String.fromCharCode(160), "g");

// Same nbsp-normalization as the server-side sanitizeArticleContent.js —
// see that file's comment for the full explanation (Quill converts plain
// spaces to a non-breaking space on load, which never offers a line-wrap
// point and overflows the container). Runs here too since this is also
// the last line of defense for any article saved before the server-side
// fix shipped, same reasoning as the rest of this file's own comment above.
export const sanitizeArticleHtml = (html) =>
  DOMPurify.sanitize((html || "").replace(NBSP_PATTERN, " "), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
