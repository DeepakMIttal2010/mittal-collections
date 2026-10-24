// Orders a category's guides for one product: guides whose title shares
// more words with the product name come first ("Satin vs Velvet Curtains"
// for a satin curtain, the Tulip guide for a Tulip comforter), newest
// first otherwise (the API's order). Entries without a slug or title, and
// repeats of the same slug, are dropped. api/render.js keeps its own copy
// -- keep the two identical.
const IGNORED_WORDS = new Set(["with", "inch", "inches", "pillow", "covers", "from"]);
const words = (text) => (text || "").toLowerCase().match(/[a-z]{4,}/g) || [];

export const rankGuidesForProduct = (articles, productName, categoryId, limit = 3) => {
  const nameWords = new Set(words(productName).filter((w) => !IGNORED_WORDS.has(w)));
  const seen = new Set();
  return (Array.isArray(articles) ? articles : [])
    // Only guides that say they belong to this category: a server without
    // the ?category= filter returns every article, with no category field.
    .filter((a) => a && categoryId && String(a.category) === String(categoryId))
    .filter((a) => typeof a.slug === "string" && a.slug && a.title && !seen.has(a.slug) && seen.add(a.slug))
    .map((article, index) => ({ article, index, score: new Set(words(article.title).filter((w) => nameWords.has(w))).size }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ article }) => article);
};
