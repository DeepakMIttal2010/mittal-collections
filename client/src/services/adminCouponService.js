import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getAllCouponsAdmin = async ({
  sortBy = "",
  sortOrder = "",
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/coupons/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return { success: true, coupons: data.coupons || [] };
  } catch (error) {
    console.error("Get Coupons Error:", error);
    return { success: false, coupons: [], message: "Unable to fetch" };
  }
};

export const addCoupon = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/coupons`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Coupon Error:", error);
    return { success: false, message: "Unable to add coupon" };
  }
};

export const updateCoupon = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/coupons/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Coupon Error:", error);
    return { success: false, message: "Unable to update coupon" };
  }
};

export const restoreCoupon = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/coupons/${id}/restore`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Restore Coupon Error:", error);
    return { success: false, message: "Unable to restore coupon" };
  }
};

export const deleteCoupon = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/coupons/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Coupon Error:", error);
    return { success: false, message: "Unable to delete coupon" };
  }
};
