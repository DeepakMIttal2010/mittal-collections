import API_BASE_URL from "./api";

export const getPageBySlug = async (slug) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}`);

    // A real 404 (page genuinely deleted/never existed) is the only case
    // that should ever be treated as "not found" — anything else (a 5xx,
    // a cold-starting backend, a network blip) is a transient failure
    // that says nothing about whether the page exists. See getProductById
    // in productService.js for the same fix, made after this exact
    // conflation caused real pages to be dropped from the index
    // ("Excluded by noindex tag" / soft-404 in Search Console).
    if (response.status === 404) {
      return { success: false, notFound: true, page: null };
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch page (status ${response.status})`);
    }

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
