import API_BASE_URL from "./api";
import { readJsonFromStorage } from "../utils/safeLocalStorage";

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

// ================= VERIFY REGISTRATION OTP =================

export const verifyRegisterOtp = async (email, otp) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, otp }),
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

// ================= GOOGLE SIGN-IN =================

export const googleSignIn = async (credential) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ credential }),
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

// ================= FORGOT PASSWORD =================

export const forgotPassword = async (email) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
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

// ================= RESET PASSWORD =================

export const resetPassword = async (token, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, password }),
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

// ================= CHANGE PASSWORD =================

export const changePassword = async (currentPassword, newPassword) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
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

// ================= GET PROFILE =================

export const getProfile = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
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

// ================= UPDATE PROFILE =================

export const updateProfile = async (name, mobile) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ name, mobile }),
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

// Best-effort server-side revocation (see authMiddleware.js's tokenVersion
// check) before clearing local storage -- previously logout was purely
// client-side, so a captured/leaked token stayed valid for its full 7-day
// life regardless of the user "logging out" (deep bug sweep, 2026-10-20).
// Fire-and-forget: a network hiccup here shouldn't block the user from
// clearing their own browser session, which is the part they can see.
export const logoutUser = () => {
  const token = getToken();

  if (token) {
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

// ================= TOKEN =================

export const getToken = () => {
  return localStorage.getItem("token");
};

// ================= CURRENT USER =================

export const getCurrentUser = () => {
  return readJsonFromStorage("user", null);
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

// ================= ADMIN SESSION (separate storage) =================
// Admin and customer sessions used to share the same "token"/"user"
// keys, so logging into one silently logged out (or hijacked) the
// other on the same browser — the admin panel and storefront are the
// same app/origin, so they shared localStorage. Kept entirely
// separate here so both sessions can be active at once.

export const saveAdminLogin = (data) => {
  localStorage.setItem("adminToken", data.token);
  localStorage.setItem("adminUser", JSON.stringify(data.user));
};

// Same server-side revocation as logoutUser above -- admin/staff tokens
// are the higher-value target, so this matters even more here.
export const logoutAdmin = () => {
  const token = getAdminToken();

  if (token) {
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
};

export const getAdminToken = () => {
  return localStorage.getItem("adminToken");
};

export const getCurrentAdminUser = () => {
  return readJsonFromStorage("adminUser", null);
};

export const isAdminLoggedIn = () => {
  return !!localStorage.getItem("adminToken");
};
