import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getAllQuestionsAdmin = async ({ sortOrder = "" } = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/questions/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();
    return { success: true, questions: data.questions || [] };
  } catch (error) {
    console.error("Get Questions Error:", error);
    return { success: false, questions: [] };
  }
};

export const answerQuestion = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/questions/${id}/answer`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Answer Question Error:", error);
    return { success: false, message: "Unable to save answer" };
  }
};

export const markQuestionSeen = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/questions/${id}/seen`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Mark Question Seen Error:", error);
    return { success: false };
  }
};

export const deleteQuestion = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/questions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Question Error:", error);
    return { success: false, message: "Unable to delete question" };
  }
};
