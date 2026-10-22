export const LOW_STOCK_THRESHOLD = 5;

// `t` is the page's own t(en, hi) from useLanguage(); without it the
// English label is used.
const english = (en) => en;

export const getStockStatus = (stock, t = english) => {
  if (stock <= 0) {
    return { label: t("Out of Stock", "स्टॉक में नहीं"), className: "text-red-600" };
  }

  // A single unit isn't "running low" the way 2-5 left are — most of
  // these are one-off curated pieces that were never a larger batch and
  // won't be restocked, so generic scarcity wording ("hurry, low
  // stock!") would misrepresent it every time it's shown. Framed as the
  // exclusivity it actually is instead.
  if (stock === 1) {
    return {
      label: t("Exclusive — Only 1 Piece Available", "एक्सक्लूसिव — सिर्फ़ 1 पीस उपलब्ध"),
      className: "text-amber-600",
    };
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return {
      label: t(`Only ${stock} left in stock!`, `स्टॉक में सिर्फ़ ${stock} बचे हैं!`),
      className: "text-amber-600",
    };
  }

  return { label: t(`In Stock (${stock})`, `स्टॉक में उपलब्ध (${stock})`), className: "text-green-600" };
};
