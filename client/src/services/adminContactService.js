import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getMessages = async ({ sortOrder = "" } = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/contact/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return { success: true, messages: data.messages || [] };
  } catch (error) {
    console.error("Get Messages Error:", error);
    return { success: false, messages: [], message: "Unable to fetch" };
  }
};

export const markAsRead = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/contact/${id}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Mark As Read Error:", error);
    return { success: false, message: "Unable to update message" };
  }
};

export const deleteMessage = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/contact/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Message Error:", error);
    return { success: false, message: "Unable to delete message" };
  }
};
