// oldPrice is often an internal reference price (the admin "Reference
// price" pricing rule fills it as purchase price x multiplier), not a
// printed MRP. Only when an admin has ticked mrpVerified (checked against
// the product packaging) may it be shown or submitted as an MRP / sale
// reference. `entry` is the product itself or one of its variants; the
// flag is product-level and covers every size.
// Returns the MRP to show, or 0 when there is nothing honest to show.
export const verifiedMrp = (product, entry = product) => {
  if (product?.mrpVerified !== true) return 0;
  const mrp = Number(entry?.oldPrice) || 0;
  const price = Number(entry?.price) || 0;
  return mrp > price ? mrp : 0;
};
