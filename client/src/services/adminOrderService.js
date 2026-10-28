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
      success: data.success,
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
// `extra` carries confirmPaidCancellation for a paid order's cancel.
export const updateOrderStatus = async (id, status, extra = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ status, ...extra }),
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
// RESEND ORDER STATUS NOTIFICATION EMAIL
// ==============================
export const resendOrderStatusEmail = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/orders/${id}/resend-status-email`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Resend Order Status Email Error:", error);

    return {
      success: false,
      message: "Unable to resend notification",
    };
  }
};

// ==============================
// CONVERT CANCELLED RAZORPAY ORDER TO COD
// ==============================
export const convertOrderToCod = async (id, { addCodCharge = false } = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/convert-to-cod`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ addCodCharge }),
    });

    return await response.json();
  } catch (error) {
    console.error("Convert Order To COD Error:", error);

    return {
      success: false,
      message: "Unable to convert order to COD",
    };
  }
};

// ==============================
// CLOSE A PAYMENT REVIEW (after checking the Razorpay dashboard)
// ==============================
export const resolvePaymentReview = async (id, note) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/payment-review/resolve`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ note }),
    });

    return await response.json();
  } catch (error) {
    console.error("Resolve Payment Review Error:", error);

    return {
      success: false,
      message: "Unable to mark the review as done",
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

// ==============================
// ORDER COST SNAPSHOT + COURIER CHARGE (Admin, "reports" permission)
// ==============================
// `status` is passed through so the caller can tell "no permission to
// see financials" (403 -> hide the panel) from a real failure.
export const getOrderCost = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/cost`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await response.json();

    return { success: data.success, status: response.status, cost: data.cost || null };
  } catch (error) {
    console.error("Get Order Cost Error:", error);

    return { success: false, status: 0, cost: null };
  }
};

export const setOrderCost = async (id, body) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/cost`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    return {
      success: data.success,
      status: response.status,
      cost: data.cost || null,
      message: data.message,
    };
  } catch (error) {
    console.error("Set Order Cost Error:", error);

    return { success: false, status: 0, cost: null, message: "Unable to save" };
  }
};
