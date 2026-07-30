import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

// ==========================
// Get My Addresses
// ==========================
export const getAddresses = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/addresses`, {
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get Addresses Error:", error);

    return { success: false, addresses: [], message: "Server Error" };
  }
};

// ==========================
// Add Address
// ==========================
export const addAddress = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/addresses`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Address Error:", error);

    return { success: false, message: "Server Error" };
  }
};

// ==========================
// Update Address
// ==========================
export const updateAddress = async (id, data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/addresses/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Address Error:", error);

    return { success: false, message: "Server Error" };
  }
};

// ==========================
// Delete Address
// ==========================
export const deleteAddress = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/addresses/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Address Error:", error);

    return { success: false, message: "Server Error" };
  }
};

// ==========================
// Set Default Address
// ==========================
export const setDefaultAddress = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/addresses/${id}/default`, {
      method: "PUT",
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Set Default Address Error:", error);

    return { success: false, message: "Server Error" };
  }
};
