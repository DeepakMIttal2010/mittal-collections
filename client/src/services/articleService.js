import API_BASE_URL from "./api";

export const getArticles = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/articles`);

    return await response.json();
  } catch (error) {
    console.error("Get Articles Error:", error);

    return { success: false, articles: [] };
  }
};

export const getArticleBySlug = async (slug) => {
  try {
    const response = await fetch(`${API_BASE_URL}/articles/slug/${slug}`);

    return await response.json();
  } catch (error) {
    console.error("Get Article Error:", error);

    return { success: false, article: null };
  }
};
