export const LOW_STOCK_THRESHOLD = 5;

export const getStockStatus = (stock) => {
  if (stock <= 0) {
    return { label: "Out of Stock", className: "text-red-600" };
  }

  // A single unit isn't "running low" the way 2-5 left are — most of
  // these are one-off curated pieces that were never a larger batch and
  // won't be restocked, so generic scarcity wording ("hurry, low
  // stock!") would misrepresent it every time it's shown. Framed as the
  // exclusivity it actually is instead.
  if (stock === 1) {
    return {
      label: "Exclusive — Only 1 Piece Available",
      className: "text-amber-600",
    };
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return {
      label: `Only ${stock} left in stock!`,
      className: "text-amber-600",
    };
  }

  return { label: `In Stock (${stock})`, className: "text-green-600" };
};
