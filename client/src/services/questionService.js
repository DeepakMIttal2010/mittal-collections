import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getProductQuestions = async (productId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/questions/product/${productId}`,
    );

    return await response.json();
  } catch (error) {
    console.error("Get Product Questions Error:", error);
    return { success: false, questions: [] };
  }
};

export const submitQuestion = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/questions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Submit Question Error:", error);
    return { success: false, message: "Unable to submit question" };
  }
};
