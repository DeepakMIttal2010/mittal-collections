import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// ==============================
// GET NOTIFICATIONS (Admin)
// ==============================
export const getNotifications = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/notifications`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Notifications Error:", error);

    return {
      success: false,
      notifications: [],
      totalUnread: 0,
    };
  }
};

// ==============================
// MARK ALL NOTIFICATIONS READ
// ==============================
export const markAllNotificationsRead = async () => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/notifications/mark-all-read`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Mark All Notifications Read Error:", error);

    return {
      success: false,
      message: "Unable to mark notifications as read",
    };
  }
};

// ==============================
// MARK SINGLE ORDER SEEN
// ==============================
export const markOrderSeen = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/seen`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Mark Order Seen Error:", error);

    return {
      success: false,
      message: "Unable to mark order as seen",
    };
  }
};

// ==============================
// MARK SINGLE MESSAGE READ
// ==============================
export const markMessageRead = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/contact/${id}/read`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Mark Message Read Error:", error);

    return {
      success: false,
      message: "Unable to mark message as read",
    };
  }
};
