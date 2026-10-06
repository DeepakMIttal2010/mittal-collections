import { Navigate, useLocation } from "react-router-dom";

import { readJsonFromStorage } from "../utils/safeLocalStorage";

function AdminProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("adminToken");
  // A corrupted adminUser value (partial write, devtools tinkering)
  // used to throw here on a bare JSON.parse — crashing this route
  // guard blank instead of just treating it as "not logged in".
  const user = readJsonFromStorage("adminUser", null);

  // e.g. scanning a product's QR code before ever logging in — send them
  // back to that exact page (not just the dashboard) once they log in.
  const redirectTarget = `${location.pathname}${location.search}`;
  const loginUrl = `/admin/login?redirect=${encodeURIComponent(redirectTarget)}`;

  // Login nahi hai -> admin login pe bhejo
  if (!token || !user) {
    return <Navigate to={loginUrl} replace />;
  }

  // Login hai but admin nahi hai -> admin login pe bhejo
  if (user.role !== "admin") {
    return <Navigate to={loginUrl} replace />;
  }

  // Sab sahi hai -> admin content dikhao
  return children;
}

export default AdminProtectedRoute;
