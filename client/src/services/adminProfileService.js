import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// ==============================
// GET PROFILE
// ==============================
export const getProfile = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Profile Error:", error);

    return {
      success: false,
      message: "Unable to fetch profile",
    };
  }
};

// ==============================
// UPDATE PROFILE
// ==============================
export const updateProfile = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Profile Error:", error);

    return {
      success: false,
      message: "Unable to update profile",
    };
  }
};

// ==============================
// CHANGE PASSWORD
// ==============================
export const changePassword = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });

    return await response.json();
  } catch (error) {
    console.error("Change Password Error:", error);

    return {
      success: false,
      message: "Unable to change password",
    };
  }
};
