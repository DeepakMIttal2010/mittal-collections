import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getStaffUsers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/staff`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await response.json();

    return { success: true, staffUsers: data.staffUsers || [] };
  } catch (error) {
    console.error("Get Staff Users Error:", error);
    return { success: false, staffUsers: [], message: "Unable to fetch" };
  }
};

export const addStaffUser = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Staff User Error:", error);
    return { success: false, message: "Unable to add staff user" };
  }
};

export const updateStaffUser = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/staff/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Staff User Error:", error);
    return { success: false, message: "Unable to update staff user" };
  }
};

export const deleteStaffUser = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/staff/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Staff User Error:", error);
    return { success: false, message: "Unable to delete staff user" };
  }
};
