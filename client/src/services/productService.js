import API_BASE_URL from "./api";

// ==========================
// Get All Products
// ==========================
export const getProducts = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/products`);

    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get Products Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

// ==========================
// Get Best Sellers (ranked by actual units sold)
// ==========================
export const getBestSellers = async (limit = 10) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/best-sellers?limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch best sellers");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get Best Sellers Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

export const getBigSavingsProducts = async (limit = 8) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/big-savings?limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch big savings products");
    }

    const data = await response.json();

    return {
      success: data.success,
      sections: data.sections || [],
      minDiscountPercent: data.minDiscountPercent,
    };
  } catch (error) {
    console.error("Get Big Savings Products Error:", error);

    return {
      success: false,
      sections: [],
    };
  }
};

// ==========================
// Get Trending Products
// ==========================
export const getTrendingProducts = async (limit = 10) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/trending?limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch trending products");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
      lastUpdated: data.lastUpdated || null,
    };
  } catch (error) {
    console.error("Get Trending Products Error:", error);

    return {
      success: false,
      products: [],
      lastUpdated: null,
    };
  }
};

// ==========================
// Get Trending Products By Category
// ==========================
export const getTrendingProductsByCategory = async (limit = 10) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/trending-by-category?limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch trending products by category");
    }

    const data = await response.json();

    return {
      success: data.success,
      sections: data.sections || [],
      lastUpdated: data.lastUpdated || null,
    };
  } catch (error) {
    console.error("Get Trending Products By Category Error:", error);

    return {
      success: false,
      sections: [],
      lastUpdated: null,
    };
  }
};

// ==========================
// Get New Arrival Products
// ==========================
export const getNewArrivalProducts = async (limit = 8) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/new-arrivals?limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch new arrival products");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get New Arrival Products Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

// ==========================
// Get New Arrivals By Category
// ==========================
export const getNewArrivalsByCategory = async (limit = 8) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/new-arrivals-by-category?limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch new arrivals by category");
    }

    const data = await response.json();

    return {
      success: data.success,
      sections: data.sections || [],
    };
  } catch (error) {
    console.error("Get New Arrivals By Category Error:", error);

    return {
      success: false,
      sections: [],
    };
  }
};

// ==========================
// Search Products
// ==========================
export const searchProducts = async (
  query,
  { category = "", sortBy = "", minPrice = "", maxPrice = "" } = {},
) => {
  try {
    const params = new URLSearchParams({ search: query });
    if (category) params.set("category", category);
    if (sortBy) params.set("sortBy", sortBy);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);

    const response = await fetch(`${API_BASE_URL}/products?${params}`);

    if (!response.ok) {
      throw new Error("Failed to search products");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Search Products Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

// ==========================
// Search Suggestions (autocomplete)
// ==========================
export const getSearchSuggestions = async (query, category = "") => {
  try {
    const params = new URLSearchParams({ q: query });
    if (category) params.set("category", category);

    const response = await fetch(
      `${API_BASE_URL}/products/suggestions?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch suggestions");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get Search Suggestions Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

// ==========================
// Get Products By Max Price
// ==========================
export const getProductsByMaxPrice = async (maxPrice) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products?maxPrice=${encodeURIComponent(maxPrice)}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get Products By Max Price Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

// ==========================
// Get Products By Category
// ==========================
export const getProductsByCategory = async (categoryId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products?category=${encodeURIComponent(categoryId)}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get Products By Category Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

// ==========================
// Get Products By Subcategory
// ==========================
export const getProductsBySubcategory = async (subcategoryId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products?subcategory=${encodeURIComponent(subcategoryId)}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }

    const data = await response.json();

    return {
      success: data.success,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get Products By Subcategory Error:", error);

    return {
      success: false,
      products: [],
    };
  }
};

// ==========================
// Get Product By ID
// ==========================
export const subscribeStockAlert = async (productId, email) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/${productId}/notify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Subscribe Stock Alert Error:", error);

    return { success: false, message: "Unable to subscribe" };
  }
};

export const getProductById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}`);

    // A real 404 (product genuinely deleted/never existed) is the only
    // case that should ever be treated as "not found" — anything else
    // (a 5xx, a cold-starting backend, a network blip) is a transient
    // failure that says nothing about whether the product exists, and
    // callers must not conflate the two: ProductDetails.jsx used to
    // noindex the page either way, which meant Googlebot hitting a
    // slow/cold backend got a false "doesn't exist" signal and quietly
    // excluded real, in-stock product pages from the index (confirmed
    // in Search Console's "Excluded by noindex tag" report, 2026-09-01).
    if (response.status === 404) {
      return { success: false, notFound: true, product: null };
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch product (status ${response.status})`);
    }

    const data = await response.json();

    return {
      success: data.success,
      notFound: false,
      product: data.product,
    };
  } catch (error) {
    console.error("Get Product Error:", error);

    return {
      success: false,
      notFound: false,
      product: null,
    };
  }
};