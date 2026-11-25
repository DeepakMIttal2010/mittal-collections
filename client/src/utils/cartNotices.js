// Cart/checkout notices (cart/checkout audit 2026-11-25).

// CK-01: loyalty points the cart promises. The server awards points on the
// merchandise left after discounts (eligibleEarnBase); the cart has no
// coupon or points applied yet, so that is the subtotal minus the bundle
// discount — the same figure checkout shows before a coupon is entered.
export const cartPointsPreview = ({ subtotal, bundleDiscount = 0, earnRate }) =>
  earnRate > 0 ? Math.floor(Math.max(subtotal - bundleDiscount, 0) / earnRate) : 0;

// CK-03: same wording as the product page badge (ProductDetails.jsx).
export const NON_RETURNABLE_LABEL = { en: "Non-returnable", hi: "गैर-वापसी योग्य" };

// Only items explicitly marked non-returnable; a line saved before the
// field existed is treated as returnable rather than guessed.
export const nonReturnableItems = (items) =>
  (Array.isArray(items) ? items : []).filter((item) => item && item.isReturnable === false);

// Checkout summary line, or null when every item is returnable.
export const nonReturnableSummary = (items, lang) => {
  const list = nonReturnableItems(items);
  if (list.length === 0) return null;
  const n = list.length;
  if (lang === "hi") {
    return {
      lead: `इस ऑर्डर में ${n} प्रोडक्ट गैर-वापसी योग्य ${n === 1 ? "है" : "हैं"}:`,
      names: list.map((item) => item.nameHi || item.name).join(", "),
    };
  }
  return {
    lead: n === 1 ? "1 item in this order is non-returnable:" : `${n} items in this order are non-returnable:`,
    names: list.map((item) => item.name).join(", "),
  };
};
