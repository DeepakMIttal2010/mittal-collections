import API_BASE_URL from "./api";
import { cachedFetchJson } from "./requestCache";

// Every homepage section that shows categories (Header, MegaMenu, Footer,
// Categories, CategoryQuickLinks, ...) calls this independently on mount —
// confirmed via a real Lighthouse network trace showing 7 separate
// /api/categories requests on a single page load. See requestCache.js.
export const getCategories = async () => {
  try {
    const data = await cachedFetchJson("categories", () =>
      fetch(`${API_BASE_URL}/categories`).then((r) => r.json()),
    );

    return {
      success: data.success,
      categories: data.categories || [],
    };
  } catch (error) {
    console.error(error);

    return {
      success: false,
      categories: [],
    };
  }
};
