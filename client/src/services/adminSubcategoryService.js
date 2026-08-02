import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getAllSubcategoriesAdmin = async ({
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
      `${API_BASE_URL}/subcategories/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return {
      success: true,
      subcategories: data.subcategories || [],
      total: data.total || 0,
      page: data.page || 1,
      pages: data.pages || 1,
    };
  } catch (error) {
    console.error("Get Subcategories Error:", error);
    return {
      success: false,
      subcategories: [],
      total: 0,
      page: 1,
      pages: 1,
      message: "Unable to fetch",
    };
  }
};

export const addSubcategory = async (formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/subcategories`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Add Subcategory Error:", error);
    return { success: false, message: "Unable to add subcategory" };
  }
};

export const updateSubcategory = async (id, formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/subcategories/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Update Subcategory Error:", error);
    return { success: false, message: "Unable to update subcategory" };
  }
};

export const restoreSubcategory = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/subcategories/${id}/restore`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Restore Subcategory Error:", error);
    return { success: false, message: "Unable to restore subcategory" };
  }
};

export const deleteSubcategory = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/subcategories/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Subcategory Error:", error);
    return { success: false, message: "Unable to delete subcategory" };
  }
};

export const permanentlyDeleteSubcategory = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/subcategories/${id}/permanent`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Permanently Delete Subcategory Error:", error);
    return {
      success: false,
      message: "Unable to permanently delete subcategory",
    };
  }
};
