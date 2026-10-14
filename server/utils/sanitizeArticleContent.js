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

// Built from the char code (not a literal character in this source
// file) so the non-breaking space this is specifically hunting for
// can never accidentally be the thing a future editor's "clean up
// whitespace" pass silently normalizes away in this very line.
const NBSP_PATTERN = new RegExp(String.fromCharCode(160), "g");

export const sanitizeArticleContent = (html) =>
  sanitizeHtml(html || "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Blocks javascript:/data: hrefs on <a> and non-image src schemes on
    // <img> — the other half of the XSS surface alongside the tag
    // allowlist above.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    // Quill (AdminArticleForm.jsx's editor) has a documented habit of
    // converting plain spaces to a non-breaking space when it loads
    // existing HTML into the editor via dangerouslyPasteHTML —
    // confirmed live, 2026-10-14: an article re-saved after being
    // opened for editing came back with EVERY space replaced (699 of
    // them in one case). A non-breaking space is, by definition, never
    // a valid line-wrap point, so a long run of nbsp-joined words
    // becomes one unbreakable "word" the browser can't wrap — the
    // paragraph overflows its container instead of flowing normally.
    // Normalizing back to a regular space here, at the point every
    // article's content is written, makes this whole bug class
    // structurally impossible regardless of what upstream editor/paste
    // path produces it.
    textFilter: (text) => text.replace(NBSP_PATTERN, " "),
  });
