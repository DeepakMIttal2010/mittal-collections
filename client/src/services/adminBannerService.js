import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getAllBannersAdmin = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/banners/admin`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await response.json();

    return { success: true, banners: data.banners || [] };
  } catch (error) {
    console.error("Get Banners Error:", error);
    return { success: false, banners: [], message: "Unable to fetch" };
  }
};

export const addBanner = async (formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/banners`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Add Banner Error:", error);
    return { success: false, message: "Unable to add banner" };
  }
};

export const updateBanner = async (id, formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/banners/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Update Banner Error:", error);
    return { success: false, message: "Unable to update banner" };
  }
};

export const restoreBanner = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/banners/${id}/restore`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Restore Banner Error:", error);
    return { success: false, message: "Unable to restore banner" };
  }
};

export const deleteBanner = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/banners/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Banner Error:", error);
    return { success: false, message: "Unable to delete banner" };
  }
};
