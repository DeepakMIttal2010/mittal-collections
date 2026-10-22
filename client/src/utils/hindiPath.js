import { useLocation } from "react-router-dom";

import { useLanguage } from "../context/LanguageContext";

// Is this a Hindi URL? The Hindi homepage is "/hi" (no trailing slash), so a
// plain startsWith("/hi/") check -- which is what every component used --
// treated the Hindi homepage as English: header, menus, footer, product
// cards and home sections all linked to English pages from /hi.
export const isHindiPath = (pathname = "") => pathname === "/hi" || pathname.startsWith("/hi/");

// "/hi" on Hindi pages, "" on English ones -- prefix for internal links.
export const langPrefix = (pathname = "") => (isHindiPath(pathname) ? "/hi" : "");

// Pages that exist in both languages (home, categories, products,
// articles) -- there the URL is the language, full stop.
const hasHindiVersion = (pathname = "") => /^\/(hi(\/|$)|$|category\/|product\/|articles(\/|$))/.test(pathname);

// Should links on this page go to the Hindi pages? On a bilingual page
// the URL decides; on a page with no /hi URL (cart, checkout, search,
// wishlist, compare, account) the shopper's chosen language does --
// otherwise a Hindi shopper who opens the cart and clicks a product lands
// on the English page and the whole site flips to English.
export const useHindiLinks = () => {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  return hasHindiVersion(pathname) ? isHindiPath(pathname) : language === "hi";
};
