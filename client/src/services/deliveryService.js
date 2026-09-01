import API_BASE_URL from "./api";

export const checkPincodeDelivery = async (pincode) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/delivery/check-pincode/${pincode}`,
    );
    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Check Pincode Delivery Error:", error);

    return { success: false };
  }
};
