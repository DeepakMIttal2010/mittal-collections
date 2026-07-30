import API_BASE_URL from "./api";

export const getPageBySlug = async (slug) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}`);

    const data = await response.json();

    return {
      success: data.success,
      page: data.page || null,
      message: data.message,
    };
  } catch (error) {
    console.error("Get Page Error:", error);

    return {
      success: false,
      page: null,
    };
  }
};
