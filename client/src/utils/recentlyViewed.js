const STORAGE_KEY = "recentlyViewedProducts";
const MAX_ITEMS = 10;

export const addRecentlyViewed = (productId) => {
  if (!productId) return;

  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const withoutCurrent = existing.filter((id) => id !== productId);

    withoutCurrent.unshift(productId);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(withoutCurrent.slice(0, MAX_ITEMS)),
    );
  } catch {
    // localStorage unavailable (private browsing, etc.) — ignore
  }
};

export const getRecentlyViewed = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};
