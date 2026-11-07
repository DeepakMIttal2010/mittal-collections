// Pure helpers for the homepage "<Category> by Size" section
// (components/SubcategoryShowcase/SizeShowcase.jsx). No React imports so
// scripts/size-showcase.test.mjs can test them with node --test.

// Which categories get a row on the homepage, in this order, and how many
// size cards each shows. Every size still has its own subcategory page and
// stays in the category page's own size filter; this only trims the
// homepage (was one row per category with sizes, 11 rows).
// byProductCount: pick the sizes with the most products (ties: admin
// displayOrder, then name) instead of the first ones in admin order.
export const HOME_SIZE_ROWS = [
  { slug: "bedsheets", maxCards: 4, byProductCount: true },
  { slug: "curtains" },
  { slug: "comforters" },
  { slug: "doormats" },
];

const isSizeGroup = (sub) => /size/i.test(sub.groupLabel || "");

// Same order the section always used (stable sort: ties keep API order).
const byDisplayOrder = (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0);

// Picks which sizes make the cut, so ties must not depend on API order.
const byProductCount = (a, b) =>
  (b.productCount ?? 0) - (a.productCount ?? 0) ||
  byDisplayOrder(a, b) ||
  String(a.name).localeCompare(String(b.name));

// categories/subcategories: the public API lists. Returns
// [{ category, groupLabel, items }] in HOME_SIZE_ROWS order; a configured
// category that is missing or has no size subcategories is skipped.
export const selectSizeRows = (categories = [], subcategories = [], config = HOME_SIZE_ROWS) =>
  config
    .map(({ slug, maxCards, byProductCount: rankByCount }) => {
      const category = categories.find((c) => c.slug === slug);
      if (!category) return null;
      const sizes = subcategories.filter(
        (sub) => sub.category?._id === category._id && isSizeGroup(sub),
      );
      if (sizes.length === 0) return null;
      const items = [...sizes].sort(rankByCount ? byProductCount : byDisplayOrder);
      return {
        category,
        groupLabel: sizes[0].groupLabel,
        items: maxCards ? items.slice(0, maxCards) : items,
      };
    })
    .filter(Boolean);

// The group label is admin-entered English ("Size", "Bed Size"); the Hindi
// heading used to print it as-is ("बेडशीट, Bed Size के अनुसार").
const GROUP_LABEL_HI = {
  size: "साइज़",
  "bed size": "बेड साइज़",
};

export const groupLabelHi = (label = "") => GROUP_LABEL_HI[label.trim().toLowerCase()] || label;
