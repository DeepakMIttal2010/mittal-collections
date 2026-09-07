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

    // A real 404 (article genuinely deleted/never existed) is the only
    // case that should ever be treated as "not found" — anything else
    // (a 5xx, a cold-starting backend, a network blip) is a transient
    // failure that says nothing about whether the article exists. See
    // getProductById in productService.js for the same fix, made after
    // this exact conflation caused real articles to be dropped from the
    // index ("Excluded by noindex tag" / soft-404 in Search Console).
    if (response.status === 404) {
      return { success: false, notFound: true, article: null };
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch article (status ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error("Get Article Error:", error);

    return { success: false, article: null };
  }
};
