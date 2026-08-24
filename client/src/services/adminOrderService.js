import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// ==============================
// GET ALL ORDERS (Admin)
// ==============================
export const getAllOrders = async ({ sortOrder = "" } = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(`${API_BASE_URL}/orders?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return {
      success: true,
      orders: data.orders || [],
    };
  } catch (error) {
    console.error("Get All Orders Error:", error);

    return {
      success: false,
      orders: [],
      message: "Unable to fetch orders",
    };
  }
};

// ==============================
// GET SINGLE ORDER
// ==============================
export const getOrderById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Order Error:", error);

    return {
      success: false,
      message: "Unable to fetch order",
    };
  }
};

// ==============================
// UPDATE ORDER STATUS
// ==============================
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
    console.error("Update Order Status Error:", error);

    return {
      success: false,
      message: "Unable to update order status",
    };
  }
};

// ==============================
// RESTORE ORDER
// ==============================
export const restoreOrder = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/restore`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Restore Order Error:", error);

    return {
      success: false,
      message: "Unable to restore order",
    };
  }
};

// ==============================
// DELETE ORDER (soft)
// ==============================
export const deleteOrder = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Order Error:", error);

    return {
      success: false,
      message: "Unable to delete order",
    };
  }
};

// ==============================
// PERMANENTLY DELETE ORDER
// ==============================
export const permanentlyDeleteOrder = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/permanent`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Permanently Delete Order Error:", error);

    return {
      success: false,
      message: "Unable to permanently delete order",
    };
  }
};
