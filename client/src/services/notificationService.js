import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
});

export const getMyNotifications = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get My Notifications Error:", error);

    return {
      success: false,
      notifications: [],
      unreadCount: 0,
    };
  }
};

export const markNotificationRead = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: "PUT",
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Mark Notification Read Error:", error);

    return { success: false };
  }
};

export const markAllNotificationsRead = async () => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/notifications/mark-all-read`,
      {
        method: "PUT",
        headers: authHeaders(),
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Mark All Notifications Read Error:", error);

    return { success: false };
  }
};
