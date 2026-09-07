import API_BASE_URL from "./api";
import { cachedFetchJson } from "./requestCache";

// Same fix as getCategories in categoryService.js — several homepage
// sections call this independently on mount (4 duplicate requests
// confirmed via a real network trace). See requestCache.js.
export const getSubcategories = async () => {
  try {
    const data = await cachedFetchJson("subcategories", () =>
      fetch(`${API_BASE_URL}/subcategories`).then((r) => r.json()),
    );

    return {
      success: true,
      subcategories: data.subcategories || [],
    };
  } catch (error) {
    console.error("Get Subcategories Error:", error);

    return {
      success: false,
      subcategories: [],
    };
  }
};
