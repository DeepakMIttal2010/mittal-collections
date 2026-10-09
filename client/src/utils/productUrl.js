const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Builds a keyword-rich product URL. The slug is decorative — the id is
// what /product/:id/:slug actually looks up — so a missing/stale slug
// on older records never breaks the link, it just reads plainer.
// isHindi prepends /hi -- there's no separate slugHi field (same slug
// string under either prefix, matching the pragmatic call already made
// for Hindi category URLs), so this is the only thing that differs.
export const productUrl = (product, isHindi = false) => {
  const slug = product.slug || slugify(product.name || "");
  const path = slug ? `/product/${product._id}/${slug}` : `/product/${product._id}`;
  return isHindi ? `/hi${path}` : path;
};
