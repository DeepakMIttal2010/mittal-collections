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