import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

// ==============================
// GET ALL PRODUCTS
// ==============================
export const getAllProducts = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/products`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return {
      success: true,
      products: data.products || [],
    };
  } catch (error) {
    console.error("Get Products Error:", error);

    return {
      success: false,
      products: [],
      message: "Unable to fetch products",
    };
  }
};

// ==============================
// GET SINGLE PRODUCT
// ==============================
export const getProductById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Product Error:", error);

    return {
      success: false,
      message: "Unable to fetch product",
    };
  }
};

// ==============================
// ADD PRODUCT
// ==============================
export const addProduct = async (formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Add Product Error:", error);

    return {
      success: false,
      message: "Unable to add product",
    };
  }
};

// ==============================
// UPDATE PRODUCT
// ==============================
export const updateProduct = async (id, formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Update Product Error:", error);

    return {
      success: false,
      message: "Unable to update product",
    };
  }
};

// ==============================
// DELETE PRODUCT
// ==============================
export const deleteProduct = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Product Error:", error);

    return {
      success: false,
      message: "Unable to delete product",
    };
  }
};
