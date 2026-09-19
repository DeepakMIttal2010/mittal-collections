import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getRoles = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/roles`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await response.json();

    return { success: true, roles: data.roles || [] };
  } catch (error) {
    console.error("Get Roles Error:", error);
    return { success: false, roles: [], message: "Unable to fetch" };
  }
};

export const addRole = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Role Error:", error);
    return { success: false, message: "Unable to add role" };
  }
};

export const updateRole = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/roles/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Role Error:", error);
    return { success: false, message: "Unable to update role" };
  }
};

export const deleteRole = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/roles/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Role Error:", error);
    return { success: false, message: "Unable to delete role" };
  }
};
