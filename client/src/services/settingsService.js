import API_BASE_URL from "./api";

export const getSiteSettings = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/settings`);

    const data = await response.json();

    return {
      success: data.success,
      settings: data.settings || {},
    };
  } catch (error) {
    console.error("Get Site Settings Error:", error);

    return {
      success: false,
      settings: {},
    };
  }
};
