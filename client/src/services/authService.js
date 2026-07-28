import API_BASE_URL from "./api";

// ================= LOGIN =================

export const loginUser = async (userData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    return await response.json();
  } catch (error) {
    console.error(error);

    return {
      success: false,
      message: "Server Error",
    };
  }
};

// ================= REGISTER =================

export const registerUser = async (userData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    return await response.json();
  } catch (error) {
    console.error(error);

    return {
      success: false,
      message: "Server Error",
    };
  }
};

// ================= SAVE LOGIN =================

export const saveLogin = (data) => {
  localStorage.setItem("token", data.token);

  localStorage.setItem("user", JSON.stringify(data.user));
};

// ================= LOGOUT =================

export const logoutUser = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

// ================= TOKEN =================

export const getToken = () => {
  return localStorage.getItem("token");
};

// ================= CURRENT USER =================

export const getCurrentUser = () => {
  const user = localStorage.getItem("user");

  return user ? JSON.parse(user) : null;
};

// ================= ADMIN CHECK =================

export const isAdmin = () => {
  const user = getCurrentUser();

  return user && user.role === "admin";
};

// ================= LOGIN CHECK =================

export const isLoggedIn = () => {
  return !!localStorage.getItem("token");
};
