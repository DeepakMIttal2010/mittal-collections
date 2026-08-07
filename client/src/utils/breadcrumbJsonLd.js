const SITE_URL = "https://www.mittalcollections.com";

// items: [{ name, path }] — path is relative ("/category/curtains"), omit
// path on the last (current) item since it doesn't need to link anywhere.
export const buildBreadcrumbJsonLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    ...(item.path && { item: `${SITE_URL}${item.path}` }),
  })),
});
