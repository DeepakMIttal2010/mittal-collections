import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");
const getAdminToken = () => localStorage.getItem("adminToken");

export const getPublicRewardsInfo = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/rewards/public`);
    return await response.json();
  } catch (error) {
    console.error("Get Public Rewards Info Error:", error);
    return { success: false };
  }
};

// Cached earn-rate lookup so product grids with many cards share a single
// network request instead of each card calling the API independently.
let earnRatePromise = null;

export const getEarnRate = () => {
  if (!earnRatePromise) {
    earnRatePromise = getPublicRewardsInfo().then((response) =>
      response.success ? response.loyalty.earnRate : null,
    );
  }

  return earnRatePromise;
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
      headers: { Authorization: `Bearer ${getAdminToken()}` },
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
        Authorization: `Bearer ${getAdminToken()}`,
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
        Authorization: `Bearer ${getAdminToken()}`,
      },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Update Referral Settings Error:", error);
    return { success: false, message: "Unable to update" };
  }
};
