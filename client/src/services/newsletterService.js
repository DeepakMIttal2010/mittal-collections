import API_BASE_URL from "./api";

const getAdminToken = () => localStorage.getItem("adminToken");

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

export const getSubscribers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/newsletter/admin`, {
      headers: { Authorization: `Bearer ${getAdminToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Subscribers Error:", error);

    return { success: false, subscribers: [], total: 0 };
  }
};

export const uploadCampaignImage = async (file) => {
  try {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch(`${API_BASE_URL}/newsletter/upload-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getAdminToken()}` },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Upload Campaign Image Error:", error);

    return { success: false, message: "Unable to upload image" };
  }
};

export const sendNewsletterCampaign = async (subject, html) => {
  try {
    const response = await fetch(`${API_BASE_URL}/newsletter/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAdminToken()}`,
      },
      body: JSON.stringify({ subject, html }),
    });

    return await response.json();
  } catch (error) {
    console.error("Send Newsletter Campaign Error:", error);

    return { success: false, message: "Unable to send campaign" };
  }
};
