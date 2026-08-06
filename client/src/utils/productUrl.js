const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Builds a keyword-rich product URL. The slug is decorative — the id is
// what /product/:id/:slug actually looks up — so a missing/stale slug
// on older records never breaks the link, it just reads plainer.
export const productUrl = (product) => {
  const slug = product.slug || slugify(product.name || "");
  return slug ? `/product/${product._id}/${slug}` : `/product/${product._id}`;
};
