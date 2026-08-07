import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

export const createReturnRequest = async ({
  orderId,
  productId,
  quantity,
  reason,
}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/returns`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ orderId, productId, quantity, reason }),
    });

    return await response.json();
  } catch (error) {
    console.error("Create Return Request Error:", error);
    return { success: false, message: "Unable to submit return request" };
  }
};

export const getMyReturnRequests = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/returns/my`, {
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get My Return Requests Error:", error);
    return { success: false, returns: [] };
  }
};

export const getAllReturnRequestsAdmin = async (status) => {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await fetch(`${API_BASE_URL}/returns/admin${query}`, {
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get All Return Requests Error:", error);
    return { success: false, returns: [] };
  }
};

export const updateReturnStatus = async (id, status, adminNote) => {
  try {
    const response = await fetch(`${API_BASE_URL}/returns/${id}/status`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status, adminNote }),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Return Status Error:", error);
    return { success: false };
  }
};
