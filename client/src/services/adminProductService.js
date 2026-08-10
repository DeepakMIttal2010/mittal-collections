import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// ==============================
// GET ALL PRODUCTS (Admin — paginated)
// ==============================
export const getAllProducts = async ({
  page = 1,
  limit = 25,
  search = "",
  sortBy = "",
  sortOrder = "",
  category = "",
  subcategory = "",
  stockStatus = "",
  dateFrom = "",
  dateTo = "",
} = {}) => {
  try {
    const params = new URLSearchParams({ page, limit });
    if (search.trim()) params.set("search", search.trim());
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);
    if (category) params.set("category", category);
    if (subcategory) params.set("subcategory", subcategory);
    if (stockStatus) params.set("stockStatus", stockStatus);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const response = await fetch(
      `${API_BASE_URL}/products/admin?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    const data = await response.json();

    return {
      success: true,
      products: data.products || [],
      total: data.total || 0,
      page: data.page || 1,
      pages: data.pages || 1,
    };
  } catch (error) {
    console.error("Get Products Error:", error);

    return {
      success: false,
      products: [],
      total: 0,
      page: 1,
      pages: 1,
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
// GET SINGLE PRODUCT (Admin — includes cost fields + secret code)
// ==============================
export const getProductByIdAdmin = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}/admin`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Admin Product Error:", error);

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
// RESTORE PRODUCT
// ==============================
export const restoreProduct = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}/restore`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Restore Product Error:", error);

    return {
      success: false,
      message: "Unable to restore product",
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

export const permanentlyDeleteProduct = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/products/${id}/permanent`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Permanently Delete Product Error:", error);

    return {
      success: false,
      message: "Unable to permanently delete product",
    };
  }
};
