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
// Search Products
// ==========================
export const searchProducts = async (query) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/products?search=${encodeURIComponent(query)}`,
    );

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