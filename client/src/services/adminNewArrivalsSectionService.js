import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getAllNewArrivalsSectionsAdmin = async ({
  sortBy = "",
  sortOrder = "",
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/new-arrivals-sections/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return { success: true, sections: data.sections || [] };
  } catch (error) {
    console.error("Get New Arrivals Sections Error:", error);
    return { success: false, sections: [], message: "Unable to fetch" };
  }
};

export const addNewArrivalsSection = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/new-arrivals-sections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add New Arrivals Section Error:", error);
    return { success: false, message: "Unable to add section" };
  }
};

export const updateNewArrivalsSection = async (id, payload) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/new-arrivals-sections/${id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Update New Arrivals Section Error:", error);
    return { success: false, message: "Unable to update section" };
  }
};

export const restoreNewArrivalsSection = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/new-arrivals-sections/${id}/restore`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Restore New Arrivals Section Error:", error);
    return { success: false, message: "Unable to restore section" };
  }
};

export const deleteNewArrivalsSection = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/new-arrivals-sections/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Delete New Arrivals Section Error:", error);
    return { success: false, message: "Unable to delete section" };
  }
};

export const permanentlyDeleteNewArrivalsSection = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/new-arrivals-sections/${id}/permanent`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Permanently Delete New Arrivals Section Error:", error);
    return {
      success: false,
      message: "Unable to permanently delete section",
    };
  }
};
