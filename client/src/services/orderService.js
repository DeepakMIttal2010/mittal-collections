import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

// =======================
// Create Order
// =======================

export const createOrder = async (orderData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },

      body: JSON.stringify(orderData),
    });

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// =======================
// Get My Orders
// =======================

export const getMyOrders = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/myorders`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// =======================
// Get Single Order
// =======================

export const getOrderById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// =======================
// Update Order Status
// =======================

export const updateOrderStatus = async (id, status) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/status`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },

      body: JSON.stringify({ status }),
    });

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};
