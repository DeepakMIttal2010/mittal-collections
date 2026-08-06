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
export const getSearchSuggestions = async (query) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products/suggestions?q=${encodeURIComponent(query)}`,
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
export const getProductById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}`);

    if (!response.ok) {
      throw new Error("Failed to fetch product");
    }

    const data = await response.json();

    return {
      success: data.success,
      product: data.product,
    };
  } catch (error) {
    console.error("Get Product Error:", error);

    return {
      success: false,
      product: null,
    };
  }
};