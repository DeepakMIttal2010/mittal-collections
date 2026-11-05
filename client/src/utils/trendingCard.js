// Pure helpers for the homepage Top Trending cards (TrendingSection.jsx).
// No React imports so scripts/trending-card.test.mjs can test them with
// node --test.

// Product names put the colour/design after the last " - " (e.g.
// "Central Table Cover 40x60 Inches - Blue Check"); a 2-line clamp on a
// narrow card cut exactly that part off, so near-identical variants
// looked the same. Splits it out so the card can always show it. Display
// only -- the stored name is untouched.
export const splitVariantName = (name) => {
  const text = String(name || "").trim();
  const at = Math.max(text.lastIndexOf(" - "), text.lastIndexOf(" – "));
  if (at <= 0) return { base: text, variant: "" };
  const variant = text.slice(at + 3).trim();
  return variant ? { base: text.slice(0, at).trim(), variant } : { base: text, variant: "" };
};
