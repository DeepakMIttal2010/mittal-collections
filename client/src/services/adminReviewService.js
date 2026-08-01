import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getAllReviewsAdmin = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/admin`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await response.json();
    return { success: true, reviews: data.reviews || [] };
  } catch (error) {
    console.error("Get Reviews Error:", error);
    return { success: false, reviews: [] };
  }
};

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
