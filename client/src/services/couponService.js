import API_BASE_URL from "./api";
import { cachedFetchJson } from "./requestCache";

const getToken = () => localStorage.getItem("token");

// Same fix as getCategories in categoryService.js — a real network trace
// showed 3 duplicate /api/coupons/banner requests on one homepage load.
// See requestCache.js.
export const getBannerCoupon = async () => {
  try {
    return await cachedFetchJson("banner-coupon", () =>
      fetch(`${API_BASE_URL}/coupons/banner`).then((r) => r.json()),
    );
  } catch (error) {
    console.error("Get Banner Coupon Error:", error);

    return { success: false, coupon: null };
  }
};

export const getFirstOrderOffer = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/coupons/first-order-offer`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Get First Order Offer Error:", error);

    return { success: false, coupon: null };
  }
};

export const validateCoupon = async (code, subtotal) => {
  try {
    const response = await fetch(`${API_BASE_URL}/coupons/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ code, subtotal }),
    });

    return await response.json();
  } catch (error) {
    console.error("Validate Coupon Error:", error);

    return { success: false, message: "Something went wrong" };
  }
};
