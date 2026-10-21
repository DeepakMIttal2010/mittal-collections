// "Satin | Curtains" / "Satin - Curtains" never contain the phrase people
// actually search ("satin curtains") -- GSC (2026-10-19) showed 80
// impressions, 0 clicks at position 10.1 for it. For a single-word
// material/brand subcategory whose name doesn't already include its
// category's own word, returns the natural search phrase ("Satin
// Curtains", "Tulip Comforters"); returns null for everything else so
// the existing "{sub} - {category}" format stays as-is. Deliberately
// narrow: size groups ("7x4 Ft Curtains") and multi-word names ("Cotton
// Covers" under Table Runners -> "Cotton Covers Table Runners") would
// read worse, so they are left alone. English only. render.js keeps a
// mirrored copy (it can't import client ESM) -- keep both in sync.
const PHRASE_GROUPS = new Set(["By Material", "By Brand"]);

export function subcategorySeoName(subcategoryName, groupLabel, categoryName) {
  const sub = (subcategoryName || "").trim();
  const category = (categoryName || "").trim();
  if (!sub || !category || !PHRASE_GROUPS.has(groupLabel)) return null;
  if (/\s/.test(sub)) return null;
  const stem = category.toLowerCase().replace(/s$/, "");
  if (sub.toLowerCase().includes(stem)) return null;
  return `${sub} ${category}`;
}
