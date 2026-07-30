import API_BASE_URL from "./api";

export const subscribeToNewsletter = async (email) => {
  try {
    const response = await fetch(`${API_BASE_URL}/newsletter/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    return {
      success: data.success,
      message: data.message,
    };
  } catch (error) {
    console.error("Newsletter Subscribe Error:", error);

    return {
      success: false,
      message: "Unable to subscribe. Please try again.",
    };
  }
};
