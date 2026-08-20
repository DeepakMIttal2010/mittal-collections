import Product from "../models/Product.js";
import SiteSettings from "../models/SiteSettings.js";

// "Complete the Look" bundles: buying from both categories in an active
// rule unlocks that rule's discount automatically at checkout, no coupon
// needed. Rules are admin-managed (see AdminSettings.jsx / SiteSettings).
//
// Rules change rarely (an admin editing settings), so instead of hitting
// the DB on every single order/cart preview, cache them in memory for a
// short window and only refetch after that — updateSiteSettings also
// invalidates the cache immediately after a save, so admin edits apply
// right away rather than waiting out the TTL.
const CACHE_TTL_MS = 60_000;
let cachedRules = null;
let cachedAt = 0;

export const invalidateBundleRulesCache = () => {
  cachedRules = null;
  cachedAt = 0;
};

const getActiveBundleRules = async () => {
  const isFresh = cachedRules && Date.now() - cachedAt < CACHE_TTL_MS;

  if (isFresh) return cachedRules;

  const settings = await SiteSettings.findOne().select("bundleRules");
  cachedRules = (settings?.bundleRules || []).filter((rule) => rule.isActive);
  cachedAt = Date.now();

  return cachedRules;
};

// Re-derives category membership from the database (never trusts client-sent
// category data) and returns the best matching bundle discount, if any.
export const calculateBundleDiscount = async (orderItems) => {
  const rules = await getActiveBundleRules();

  if (rules.length === 0) {
    return { eligible: false, discountAmount: 0 };
  }

  const productIds = orderItems.map((item) => item.product);

  const products = await Product.find({ _id: { $in: productIds } }).select(
    "category",
  );

  const categoryByProductId = new Map(
    products.map((p) => [p._id.toString(), p.category?.toString()]),
  );

  const presentCategoryIds = new Set(categoryByProductId.values());

  const matchedRule = rules
    .filter(
      (rule) =>
        presentCategoryIds.has(rule.categoryA.toString()) &&
        presentCategoryIds.has(rule.categoryB.toString()),
    )
    .sort((a, b) => b.discountPercent - a.discountPercent)[0];

  if (!matchedRule) {
    return { eligible: false, discountAmount: 0 };
  }

  // Discount applies only to items from the two matched categories, not
  // the whole order — an unrelated item riding along in the same order
  // must not get discounted just because a bundle unlocked.
  const ruleCategoryIds = new Set([
    matchedRule.categoryA.toString(),
    matchedRule.categoryB.toString(),
  ]);

  const bundleEligibleSubtotal = orderItems.reduce((sum, item) => {
    const categoryId = categoryByProductId.get(item.product.toString());
    return categoryId && ruleCategoryIds.has(categoryId)
      ? sum + item.price * item.quantity
      : sum;
  }, 0);

  const discountAmount = Math.round(
    (bundleEligibleSubtotal * matchedRule.discountPercent) / 100,
  );

  return {
    eligible: true,
    discountAmount,
    discountPercent: matchedRule.discountPercent,
  };
};
