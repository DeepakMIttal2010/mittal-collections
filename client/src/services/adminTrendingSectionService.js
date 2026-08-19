import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getAllTrendingSectionsAdmin = async ({
  sortBy = "",
  sortOrder = "",
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/trending-sections/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return { success: true, sections: data.sections || [] };
  } catch (error) {
    console.error("Get Trending Sections Error:", error);
    return { success: false, sections: [], message: "Unable to fetch" };
  }
};

export const addTrendingSection = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/trending-sections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Trending Section Error:", error);
    return { success: false, message: "Unable to add section" };
  }
};

export const updateTrendingSection = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/trending-sections/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Trending Section Error:", error);
    return { success: false, message: "Unable to update section" };
  }
};

export const restoreTrendingSection = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/trending-sections/${id}/restore`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Restore Trending Section Error:", error);
    return { success: false, message: "Unable to restore section" };
  }
};

export const deleteTrendingSection = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/trending-sections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Trending Section Error:", error);
    return { success: false, message: "Unable to delete section" };
  }
};

export const permanentlyDeleteTrendingSection = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/trending-sections/${id}/permanent`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Permanently Delete Trending Section Error:", error);
    return {
      success: false,
      message: "Unable to permanently delete section",
    };
  }
};
