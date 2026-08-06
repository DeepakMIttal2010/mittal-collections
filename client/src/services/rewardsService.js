import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getPublicRewardsInfo = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/rewards/public`);
    return await response.json();
  } catch (error) {
    console.error("Get Public Rewards Info Error:", error);
    return { success: false };
  }
};

export const getMyLoyaltyTransactions = async (page = 1) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/rewards/my-transactions?page=${page}`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    return await response.json();
  } catch (error) {
    console.error("Get My Loyalty Transactions Error:", error);
    return { success: false, transactions: [] };
  }
};

export const getRewardsSettingsAdmin = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/rewards/admin`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    return await response.json();
  } catch (error) {
    console.error("Get Rewards Settings Error:", error);
    return { success: false };
  }
};

export const updateLoyaltySettings = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/rewards/admin/loyalty`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Update Loyalty Settings Error:", error);
    return { success: false, message: "Unable to update" };
  }
};

export const updateReferralSettings = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/rewards/admin/referral`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Update Referral Settings Error:", error);
    return { success: false, message: "Unable to update" };
  }
};
