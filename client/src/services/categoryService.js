import API_BASE_URL from "./api";

export const getCategories = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories`);

    const data = await response.json();

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
