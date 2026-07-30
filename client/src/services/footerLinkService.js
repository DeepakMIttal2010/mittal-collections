import API_BASE_URL from "./api";

export const getFooterLinks = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/footer-links`);

    const data = await response.json();

    return { success: true, links: data.links || [] };
  } catch (error) {
    console.error("Get Footer Links Error:", error);
    return { success: false, links: [] };
  }
};
