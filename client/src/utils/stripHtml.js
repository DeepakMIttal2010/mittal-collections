import DOMPurify from "dompurify";

// Product descriptions are now authored as rich-text HTML (see
// AddProduct.jsx/EditProduct.jsx's ReactQuill fields) but several
// places still need a plain-text version — SEO meta descriptions and
// the "read more" length check can't work against raw markup, and
// showing stray <p>/<li> tags in a meta tag or truncation count would
// be a real regression from the plain-textarea days.
//
// The actual tag removal goes through DOMPurify (a real HTML parser),
// not a hand-rolled regex — a regex like /<[^>]+>/g only ever does one
// pass, so an input crafted like "<scr<script>ipt>" strips the inner
// tag and leaves the outer fragments to reform "<script>" (CodeQL
// flags exactly this as "incomplete multi-character sanitization").
// The two regexes below only ever INSERT a space at a block boundary
// before that real strip — they never remove anything themselves, so
// they can't be tricked into leaving markup behind.
export const stripHtml = (html) => {
  const withSpacing = (html || "")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "</$1> ")
    .replace(/<br\s*\/?>/gi, " ");

  const safeHtml = DOMPurify.sanitize(withSpacing, { ALLOWED_TAGS: [] });

  // DOMPurify's return value here is still HTML-safe markup meant to be
  // re-inserted via innerHTML, not literal plain text — it keeps (and
  // sometimes inserts, e.g. a "&nbsp;" separator at a word boundary
  // where two adjacent stripped tags met) real HTML entities. Every
  // caller renders this result directly as plain text (a JSX text
  // node, which doesn't decode entities), so "&nbsp;" was showing up
  // verbatim instead of as a space. Round-tripping through a real
  // element's innerHTML/textContent is what actually decodes it — safe
  // here since DOMPurify has already stripped every tag from safeHtml.
  const el = document.createElement("div");
  el.innerHTML = safeHtml;

  return el.textContent.replace(/\s+/g, " ").trim();
};
