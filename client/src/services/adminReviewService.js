import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// Filter keys the server understands (see buildAdminReviewFilter in
// server/controllers/reviewModerationController.js). Empty values are left
// out so "All" sends nothing.
const REVIEW_FILTER_KEYS = ["status", "visibility", "rating", "hasPhotos", "rewarded", "from", "to"];

export const getAllReviewsAdmin = async ({ sortOrder = "", filters = {} } = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortOrder) params.set("sortOrder", sortOrder);
    for (const key of REVIEW_FILTER_KEYS) {
      if (filters[key]) params.set(key, filters[key]);
    }

    const response = await fetch(
      `${API_BASE_URL}/reviews/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();
    if (!response.ok) {
      return { success: false, reviews: [], message: data.message || "Unable to load reviews" };
    }
    return {
      success: true,
      reviews: data.reviews || [],
      // Set when the server's safety cap cut the list short.
      total: typeof data.total === "number" ? data.total : (data.reviews || []).length,
      truncated: Boolean(data.truncated),
    };
  } catch (error) {
    console.error("Get Reviews Error:", error);
    return { success: false, reviews: [] };
  }
};

export const getReviewSummaryAdmin = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/admin/summary`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Review Summary Error:", error);
    return { success: false };
  }
};

const sendJson = async (method, path, body, failMessage) => {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });

    return await response.json();
  } catch (error) {
    console.error(`${failMessage}:`, error);
    return { success: false, message: failMessage };
  }
};

export const hideReview = (id, reason) =>
  sendJson("PUT", `/reviews/${id}/hide`, { reason }, "Unable to hide review");

export const unhideReview = (id) =>
  sendJson("PUT", `/reviews/${id}/unhide`, null, "Unable to unhide review");

export const saveReviewReply = (id, text) =>
  sendJson("PUT", `/reviews/${id}/reply`, { text }, "Unable to save reply");

export const deleteReviewReply = (id) =>
  sendJson("DELETE", `/reviews/${id}/reply`, null, "Unable to remove reply");

export const approveReview = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/${id}/approve`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Approve Review Error:", error);
    return { success: false, message: "Unable to approve review" };
  }
};

export const markReviewSeen = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/${id}/seen`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Mark Review Seen Error:", error);
    return { success: false };
  }
};

export const deleteReview = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Review Error:", error);
    return { success: false, message: "Unable to delete review" };
  }
};

// Takes back a rewarded review's bonus points (fake/fraudulent review).
// reason is required (10-1000 chars); evidence is optional notes.
export const reverseReviewBonus = async (id, { reason, evidence = "" }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/${id}/reverse-bonus`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason, evidence }),
    });

    // The status lets the dialog tell "already reversed" (409) apart.
    const data = await response.json();
    return { ...data, status: response.status };
  } catch (error) {
    console.error("Reverse Review Bonus Error:", error);
    return { success: false, message: "Unable to reverse the bonus" };
  }
};

// Pays a bonus held at approval (the item was being returned), once the
// return was rejected. The server re-checks eligibility and pays at most
// once; a 409 means it is still held or was already processed.
export const grantReviewBonus = (id) =>
  sendJson("POST", `/reviews/${id}/grant-bonus`, null, "Unable to grant the bonus");
