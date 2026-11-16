import API_BASE_URL from "./api";
import { isAdminLoggedIn } from "./authService";
import { getVisitorId, isInternalDevice } from "../utils/visitorId";

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

// PR-B2 Delivery Demand: after a check says "delivery unavailable",
// quietly note the PIN so the owner can see demand from areas we don't
// deliver to yet. Fire-and-forget: never awaited, never shown, never
// changes what the shopper sees. Skipped for the owner's/staff's own
// browsers and automated browsers (same rules as VisitTracker).
export const recordDeliveryDemand = ({ pincode, source, productId, items } = {}) => {
  try {
    if (isInternalDevice() || navigator.webdriver || isAdminLoggedIn()) return;

    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    if (storedUser?.role === "admin") return;

    const token = localStorage.getItem("token");
    const body = {
      pincode,
      source,
      visitorId: getVisitorId(),
      ...(productId && { productId: String(productId) }),
      ...(items && { items }),
    };

    fetch(`${API_BASE_URL}/delivery/demand`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Demand tracking must never break the page.
  }
};
