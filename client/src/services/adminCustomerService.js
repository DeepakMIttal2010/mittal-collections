import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

// ==============================
// GET ALL CUSTOMERS
// ==============================
export const getAllCustomers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/customers`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return {
      success: true,
      customers: data.customers || [],
    };
  } catch (error) {
    console.error("Get All Customers Error:", error);

    return {
      success: false,
      customers: [],
      message: "Unable to fetch customers",
    };
  }
};

// ==============================
// GET SINGLE CUSTOMER (with orders)
// ==============================
export const getCustomerById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/customers/${id}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Customer Error:", error);

    return {
      success: false,
      message: "Unable to fetch customer",
    };
  }
};

// ==============================
// TOGGLE BLOCK / UNBLOCK
// ==============================
export const toggleBlockCustomer = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/customers/${id}/toggle-block`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Toggle Block Error:", error);

    return {
      success: false,
      message: "Unable to update customer status",
    };
  }
};

// ==============================
// DELETE CUSTOMER
// ==============================
export const deleteCustomer = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/customers/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Customer Error:", error);

    return {
      success: false,
      message: "Unable to delete customer",
    };
  }
};
