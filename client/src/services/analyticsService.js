import API_BASE_URL from "./api";

export const recordVisit = async (path, visitorId, userId) => {
  try {
    await fetch(`${API_BASE_URL}/analytics/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, visitorId, userId: userId || undefined }),
    });
  } catch {
    // best-effort, tracking should never break the page
  }
};

export const getMyLocation = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/analytics/my-location`);
    const data = await response.json();

    return {
      success: data.success,
      location: data.location || null,
    };
  } catch (error) {
    console.error("Get My Location Error:", error);

    return {
      success: false,
      location: null,
    };
  }
};

export const getProductViewCount = async (productId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/analytics/product-views/${productId}`,
    );

    const data = await response.json();

    return {
      success: data.success,
      count: data.count || 0,
    };
  } catch (error) {
    console.error("Get Product View Count Error:", error);

    return {
      success: false,
      count: 0,
    };
  }
};
