import { createContext, useContext, useEffect, useState } from "react";

import { readJsonFromStorage } from "../utils/safeLocalStorage";
import API_BASE_URL from "../services/api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Restore user immediately on first render
  const [user, setUser] = useState(() => readJsonFromStorage("user", null));

  // Flips true for one render right after a successful login, so
  // components (like the welcome popup) can react to "just logged in"
  // without guessing from the user object alone.
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  // Separate from justLoggedIn — that fires on every login, including a
  // returning customer's routine sign-in. This fires only at the true
  // moment an account is first created (email/password OTP verified, or
  // a brand-new Google account finishing its mobile-number step), so the
  // congratulations/benefits popup shows once for new signups instead of
  // nagging repeat visitors every time they log in.
  const [justRegistered, setJustRegistered] = useState(false);

  const login = (userData, token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    setJustLoggedIn(true);
  };

  const clearJustLoggedIn = () => setJustLoggedIn(false);

  const markJustRegistered = () => setJustRegistered(true);
  const clearJustRegistered = () => setJustRegistered(false);

  // Best-effort server-side revocation (see authMiddleware.js's
  // tokenVersion check) before clearing local storage -- previously
  // logout was purely client-side, so a captured/leaked token stayed
  // valid for its full 7-day life regardless of the user "logging out"
  // (deep bug sweep, 2026-10-20). Fire-and-forget: a network hiccup here
  // shouldn't block the user from clearing their own browser session.
  const logout = () => {
    const token = localStorage.getItem("token");

    if (token) {
      fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
  };

  // The "storage" event only fires in OTHER tabs, never the one that made
  // the change, so this never fights with login()/logout() in this same
  // tab. Without it, a tab left open on e.g. /account keeps showing the
  // user as logged in after they sign out in another tab, until it hits
  // a 401 on its next request.
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key !== "token") return;

      setUser(event.newValue ? readJsonFromStorage("user", null) : null);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const updateUser = (updatedFields) => {
    setUser((prev) => {
      const merged = { ...prev, ...updatedFields };
      localStorage.setItem("user", JSON.stringify(merged));
      return merged;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        updateUser,
        isLoggedIn: !!user,
        justLoggedIn,
        clearJustLoggedIn,
        justRegistered,
        markJustRegistered,
        clearJustRegistered,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
