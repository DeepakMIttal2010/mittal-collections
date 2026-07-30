import API_BASE_URL from "./api";

export const getBanners = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/banners`);

    const data = await response.json();

    return { success: true, banners: data.banners || [] };
  } catch (error) {
    console.error("Get Banners Error:", error);
    return { success: false, banners: [] };
  }
};
