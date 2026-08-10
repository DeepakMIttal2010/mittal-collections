import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getAllPagesAdmin = async ({ sortBy = "", sortOrder = "" } = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/pages/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return { success: true, pages: data.pages || [] };
  } catch (error) {
    console.error("Get Pages Error:", error);
    return { success: false, pages: [], message: "Unable to fetch" };
  }
};

export const createPage = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Create Page Error:", error);
    return { success: false, message: "Unable to create page" };
  }
};

export const updatePage = async (slug, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Page Error:", error);
    return { success: false, message: "Unable to update page" };
  }
};

export const restorePage = async (slug) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}/restore`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Restore Page Error:", error);
    return { success: false, message: "Unable to restore page" };
  }
};

export const deletePage = async (slug) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Page Error:", error);
    return { success: false, message: "Unable to delete page" };
  }
};

export const permanentlyDeletePage = async (slug) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}/permanent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Permanently Delete Page Error:", error);
    return {
      success: false,
      message: "Unable to permanently delete page",
    };
  }
};
