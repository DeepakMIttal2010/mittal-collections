// oldPrice is often an internal reference price (the admin "Reference
// price" pricing rule fills it as purchase price x multiplier), not a
// printed MRP. Only a product whose admin ticked "Printed MRP verified"
// may show it as an MRP with a strike-through or a % off. `entry` is the
// product or the selected variant; the flag is product-level and covers
// every size. Mirrors server/utils/verifiedMrp.js (Merchant feed).

// The MRP to show, or 0 when there is nothing honest to show.
export const verifiedMrp = (product, entry = product) => {
  if (product?.mrpVerified !== true) return 0;
  const mrp = Number(entry?.oldPrice) || 0;
  const price = Number(entry?.price) || 0;
  return mrp > price ? mrp : 0;
};

// Whole-number % off the verified MRP, or 0.
export const verifiedDiscountPercent = (product, entry = product) => {
  const mrp = verifiedMrp(product, entry);
  return mrp ? Math.round(((mrp - Number(entry.price)) / mrp) * 100) : 0;
};
