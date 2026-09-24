import API_BASE_URL from "./api";
import { cachedFetchJson } from "./requestCache";

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

// Admin-only: tells the server this browser belongs to the owner/staff
// so it deletes this visitorId's past visits (see VisitTracker.jsx).
export const markInternalDevice = async (visitorId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/analytics/internal-device`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ visitorId }),
    });

    return await response.json();
  } catch {
    return { success: false };
  }
};

// Same fix as getCategories in categoryService.js — a real network trace
// showed 3 duplicate /api/analytics/my-location requests on one homepage
// load. See requestCache.js.
export const getMyLocation = async () => {
  try {
    const data = await cachedFetchJson("my-location", () =>
      fetch(`${API_BASE_URL}/analytics/my-location`).then((r) => r.json()),
    );

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
