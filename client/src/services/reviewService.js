import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getProductReviews = async (productId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/reviews/product/${productId}`,
    );

    return await response.json();
  } catch (error) {
    console.error("Get Product Reviews Error:", error);
    return { success: false, reviews: [], totalReviews: 0, averageRating: 0 };
  }
};

export const submitReview = async (formData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Submit Review Error:", error);
    return { success: false, message: "Unable to submit review" };
  }
};
