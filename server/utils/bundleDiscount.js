import Product from "../models/Product.js";

// "Complete the Look" bundle: buying from both of these categories in the
// same order unlocks an automatic discount, no coupon code needed. Keep in
// sync with the client-side copy in CartContext.jsx (client only uses it
// for a live preview — this is the authoritative calculation).
export const BUNDLE_CATEGORY_SLUGS = ["bedsheets", "cushion-covers"];
export const BUNDLE_DISCOUNT_PERCENT = 10;

// Re-derives category membership from the database (never trusts client-sent
// category data) and returns the discount to apply, if the order qualifies.
export const calculateBundleDiscount = async (orderItems, subtotal) => {
  const productIds = orderItems.map((item) => item.product);

  const products = await Product.find({ _id: { $in: productIds } })
    .select("category")
    .populate("category", "slug");

  const presentSlugs = new Set(
    products.map((p) => p.category?.slug).filter(Boolean),
  );

  const eligible = BUNDLE_CATEGORY_SLUGS.every((slug) =>
    presentSlugs.has(slug),
  );

  if (!eligible) {
    return { eligible: false, discountAmount: 0 };
  }

  const discountAmount = Math.round(
    (subtotal * BUNDLE_DISCOUNT_PERCENT) / 100,
  );

  return { eligible: true, discountAmount, discountPercent: BUNDLE_DISCOUNT_PERCENT };
};
