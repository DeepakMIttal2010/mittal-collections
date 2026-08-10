import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// ==============================
// GET ALL CATEGORIES (Admin — paginated)
// ==============================
export const getAllCategories = async ({
  page = 1,
  limit = 25,
  search = "",
  sortBy = "",
  sortOrder = "",
} = {}) => {
  try {
    const params = new URLSearchParams({ page, limit });
    if (search.trim()) params.set("search", search.trim());
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/categories/admin?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    const data = await response.json();

    return {
      success: true,
      categories: data.categories || [],
      total: data.total || 0,
      page: data.page || 1,
      pages: data.pages || 1,
    };
  } catch (error) {
    console.error("Get Categories Error:", error);

    return {
      success: false,
      categories: [],
      total: 0,
      page: 1,
      pages: 1,
      message: "Unable to fetch categories",
    };
  }
};

// ==============================
// GET SINGLE CATEGORY
// ==============================
export const getCategoryById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories/${id}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Category Error:", error);

    return {
      success: false,
      message: "Unable to fetch category",
    };
  }
};

// ==============================
// ADD CATEGORY
// ==============================
export const addCategory = async (formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Add Category Error:", error);

    return {
      success: false,
      message: "Unable to add category",
    };
  }
};

// ==============================
// UPDATE CATEGORY
// ==============================
export const updateCategory = async (id, formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Update Category Error:", error);

    return {
      success: false,
      message: "Unable to update category",
    };
  }
};

// ==============================
// RESTORE CATEGORY
// ==============================
export const restoreCategory = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories/${id}/restore`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Restore Category Error:", error);

    return {
      success: false,
      message: "Unable to restore category",
    };
  }
};

// ==============================
// DELETE CATEGORY
// ==============================
export const deleteCategory = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Category Error:", error);

    return {
      success: false,
      message: "Unable to delete category",
    };
  }
};

export const permanentlyDeleteCategory = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/categories/${id}/permanent`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Permanently Delete Category Error:", error);

    return {
      success: false,
      message: "Unable to permanently delete category",
    };
  }
};
