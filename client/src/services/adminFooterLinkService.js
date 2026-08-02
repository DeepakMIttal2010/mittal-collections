import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getAllFooterLinksAdmin = async ({
  sortBy = "",
  sortOrder = "",
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/footer-links/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return { success: true, links: data.links || [] };
  } catch (error) {
    console.error("Get Footer Links Error:", error);
    return { success: false, links: [], message: "Unable to fetch" };
  }
};

export const addFooterLink = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/footer-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Footer Link Error:", error);
    return { success: false, message: "Unable to add footer link" };
  }
};

export const updateFooterLink = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/footer-links/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Footer Link Error:", error);
    return { success: false, message: "Unable to update footer link" };
  }
};

export const deleteFooterLink = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/footer-links/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Footer Link Error:", error);
    return { success: false, message: "Unable to delete footer link" };
  }
};
