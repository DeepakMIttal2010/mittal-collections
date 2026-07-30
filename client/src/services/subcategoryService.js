import API_BASE_URL from "./api";

export const getSubcategories = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/subcategories`);

    const data = await response.json();

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
