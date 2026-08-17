import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Restore user immediately on first render
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  });

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

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
  };

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
