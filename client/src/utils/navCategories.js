// The category fields the desktop nav (MegaMenu.jsx) renders, validated --
// shared by MegaMenu and scripts/fetch-nav-categories.mjs (which writes
// the build-time snapshot), so both treat malformed data the same way.

const toNavCategory = (category) => {
  if (!category || typeof category !== "object") return null;
  const { _id, name, nameHi, slug } = category;
  if (typeof _id !== "string" || !_id) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  if (typeof slug !== "string" || !slug) return null;
  return { _id, name, nameHi: typeof nameHi === "string" ? nameHi : "", slug };
};

// The API's order is the nav order (it sorts by displayOrder), so it is
// kept as-is. Returns null when the list itself can't be trusted.
export const toNavCategories = (categories) => {
  if (!Array.isArray(categories)) return null;
  const valid = categories.map(toNavCategory);
  return valid.every(Boolean) ? valid : null;
};

// Reads a GET /api/categories body: null when it can't be trusted.
export const parseNavCategoriesResponse = (data) =>
  data && typeof data === "object" && data.success === true ? toNavCategories(data.categories) : null;
