import Product from "../models/Product.js";
import Category from "../models/Category.js";
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

  // Discount applies only to items from the matched rule's two categories,
  // not the whole order — an unrelated item riding along must not get
  // discounted just because some bundle unlocked. When more than one rule
  // matches at once (e.g. cart has Bedsheets + Cushion Covers + Doormats,
  // and each pair has its own rule), only one rule ever applies — never
  // stacked — but which one is picked matters: it's whichever pair yields
  // the highest actual rupee discount, not just the highest percent (a
  // lower % on a bigger-value pair can beat a higher % on a smaller one).
  const eligibleSubtotalFor = (rule) => {
    const ruleCategoryIds = new Set([
      rule.categoryA.toString(),
      rule.categoryB.toString(),
    ]);

    return orderItems.reduce((sum, item) => {
      const categoryId = categoryByProductId.get(item.product.toString());
      return categoryId && ruleCategoryIds.has(categoryId)
        ? sum + item.price * item.quantity
        : sum;
    }, 0);
  };

  const bestCandidate = rules
    .filter(
      (rule) =>
        presentCategoryIds.has(rule.categoryA.toString()) &&
        presentCategoryIds.has(rule.categoryB.toString()),
    )
    .map((rule) => {
      const eligibleSubtotal = eligibleSubtotalFor(rule);
      return {
        rule,
        discountAmount: Math.round(
          (eligibleSubtotal * rule.discountPercent) / 100,
        ),
      };
    })
    .sort((a, b) => b.discountAmount - a.discountAmount)[0];

  if (!bestCandidate) {
    return { eligible: false, discountAmount: 0 };
  }

  // Snapshotted onto the order (see Order.js's bundleDiscountCategories)
  // so a later rule edit can't rewrite what a past order actually got.
  const matchedCategories = await Category.find({
    _id: { $in: [bestCandidate.rule.categoryA, bestCandidate.rule.categoryB] },
  }).select("name");
  const categoryNames = matchedCategories.map((c) => c.name);

  return {
    eligible: true,
    discountAmount: bestCandidate.discountAmount,
    discountPercent: bestCandidate.rule.discountPercent,
    categoryNames,
  };
};
