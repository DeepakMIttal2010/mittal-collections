import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getProductForPOS = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/pos/product/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Product For POS Error:", error);

    return { success: false, message: "Unable to fetch product" };
  }
};

export const lookupCustomerByMobile = async (mobile) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/pos/customer?mobile=${encodeURIComponent(mobile)}`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );

    return await response.json();
  } catch (error) {
    console.error("Lookup Customer Error:", error);

    return { success: false, customer: null };
  }
};

export const recordOfflineSale = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/pos/sale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Record Offline Sale Error:", error);

    return { success: false, message: "Unable to record sale" };
  }
};

export const getOfflineSales = async ({ page = 1, limit = 25 } = {}) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/pos/sales?page=${page}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );

    return await response.json();
  } catch (error) {
    console.error("Get Offline Sales Error:", error);

    return { success: false, sales: [] };
  }
};
