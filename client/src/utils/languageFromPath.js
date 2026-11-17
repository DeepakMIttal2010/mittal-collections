// Pure helpers (no React imports) so node --test can load them directly.

// Is this a Hindi URL? The Hindi homepage is "/hi" (no trailing slash).
export const isHindiPath = (pathname = "") => pathname === "/hi" || pathname.startsWith("/hi/");

// Routes that really exist in both languages (see routes/AppRoutes.jsx):
// home, category/subcategory, product, articles list/detail, new arrivals.
// Tested against the path with any "/hi" prefix removed, so a /hi/ URL
// that has no Hindi route (e.g. "/hi/contact") does not count.
export const BILINGUAL_ROUTE = /^\/(?:$|category\/|product\/|articles(?:\/|$)|new-arrivals\/?$)/;

// The language a URL itself stands for.
export const urlLanguage = (pathname = "") => (isHindiPath(pathname) ? "hi" : "en");

export const isBilingualPath = (pathname = "") => {
  const rest = isHindiPath(pathname) ? pathname.slice(3) || "/" : pathname;
  return BILINGUAL_ROUTE.test(rest);
};

// Language for the very first render. On a bilingual page the URL decides,
// so the page never paints in the other language first and then flips
// (that flip changed the delivery banner's height and shifted the whole
// page: CLS ~0.15-0.21 on mobile). Everywhere else (cart, checkout,
// account, /hi/ URLs with no Hindi route) the saved choice still applies.
export const initialLanguage = (pathname = "", saved = null) => {
  if (isBilingualPath(pathname)) return urlLanguage(pathname);
  return saved === "hi" ? "hi" : "en";
};
