import API_BASE_URL from "./api";

export const getCategories = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories`);

    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }

    const data = await response.json();

    return data.categories;
  } catch (error) {
    console.error("Category Service Error:", error);
    return [];
  }
};
