import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getSiteSettingsAdmin = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await response.json();

    return { success: data.success, settings: data.settings || {} };
  } catch (error) {
    console.error("Get Site Settings Error:", error);
    return { success: false, settings: {}, message: "Unable to fetch" };
  }
};

export const updateSiteSettings = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Site Settings Error:", error);
    return { success: false, message: "Unable to update settings" };
  }
};
