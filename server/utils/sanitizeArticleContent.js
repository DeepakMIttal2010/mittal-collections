import sanitizeHtml from "sanitize-html";

// Article content is authored in the admin panel via a Quill editor
// (client/src/pages/admin/AdminArticleForm.jsx's TOOLBAR_CONFIG) and
// rendered back out on ArticleDetail.jsx via dangerouslySetInnerHTML
// with no sanitization anywhere in that pipeline — any account with
// article-write permission (or a compromised admin session) could
// inject a <script>/onerror= payload that runs in every visitor's
// browser, and since the customer JWT lives in localStorage rather
// than an httpOnly cookie, that's a direct path to stealing it.
// Sanitizing here (on write, not just on read) means every consumer
// of this content — the client render, the bot-prerender API in
// client/api/render.js, any future RSS/API export — inherits the fix
// for free, and a malicious value can never reach the database in the
// first place.
//
// Allowlist matches exactly what the Quill toolbar can actually
// produce — nothing more. Extend both together if the toolbar ever
// gains a new format.
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

const ALLOWED_ATTRIBUTES = {
  a: ["href", "target", "rel"],
  img: ["src", "alt"],
};

export const sanitizeArticleContent = (html) =>
  sanitizeHtml(html || "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Blocks javascript:/data: hrefs on <a> and non-image src schemes on
    // <img> — the other half of the XSS surface alongside the tag
    // allowlist above.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
  });
