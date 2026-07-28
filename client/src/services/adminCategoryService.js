import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

// ==============================
// GET ALL CATEGORIES
// ==============================
export const getAllCategories = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/categories`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return {
      success: true,
      categories: data.categories || [],
    };
  } catch (error) {
    console.error("Get Categories Error:", error);

    return {
      success: false,
      categories: [],
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
