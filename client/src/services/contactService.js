import API_BASE_URL from "./api";

export const submitContactMessage = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    return await response.json();
  } catch (error) {
    console.error("Submit Contact Message Error:", error);

    return {
      success: false,
      message: "Unable to send message. Please try again.",
    };
  }
};
