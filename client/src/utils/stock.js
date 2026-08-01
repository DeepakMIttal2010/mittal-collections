export const LOW_STOCK_THRESHOLD = 5;

export const getStockStatus = (stock) => {
  if (stock <= 0) {
    return { label: "Out of Stock", className: "text-red-600" };
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return {
      label: `Only ${stock} left in stock!`,
      className: "text-amber-600",
    };
  }

  return { label: `In Stock (${stock})`, className: "text-green-600" };
};
