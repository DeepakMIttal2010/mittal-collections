// Internal links inside a Hindi article body (contentHi) are authored by
// hand, mostly as plain English URLs ("/category/curtains/satin") and a
// few as /hi/ URLs for pages that have no Hindi version ("/hi/contact" --
// a 404). Rewrites every internal href for the Hindi page it's shown on:
// pages with a /hi/ twin (home, categories, products, articles -- same
// set as hindiPath.js's hasHindiVersion) get the /hi prefix, everything
// else goes to its English URL. api/render.js keeps its own copy -- keep
// the two identical.
const HINDI_TWIN = /^\/($|category\/|product\/|articles(\/|$))/;
const INTERNAL_HREF = /href="(?:https?:\/\/(?:www\.)?mittalcollections\.com)?(\/[^"]*)"/g;

export const localizeContentLinksHi = (html) =>
  (html || "").replace(INTERNAL_HREF, (match, path) => {
    const base = path.replace(/^\/hi(?=[/?#]|$)/, "") || "/";
    if (!HINDI_TWIN.test(base)) return `href="${base}"`;
    return `href="${base === "/" ? "/hi" : `/hi${base}`}"`;
  });
