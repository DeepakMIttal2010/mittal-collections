// Is this a Hindi URL? The Hindi homepage is "/hi" (no trailing slash), so a
// plain startsWith("/hi/") check -- which is what every component used --
// treated the Hindi homepage as English: header, menus, footer, product
// cards and home sections all linked to English pages from /hi.
export const isHindiPath = (pathname = "") => pathname === "/hi" || pathname.startsWith("/hi/");

// "/hi" on Hindi pages, "" on English ones -- prefix for internal links.
export const langPrefix = (pathname = "") => (isHindiPath(pathname) ? "/hi" : "");
