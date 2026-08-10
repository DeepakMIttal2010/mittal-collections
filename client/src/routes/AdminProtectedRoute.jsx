import { Navigate, useLocation } from "react-router-dom";

function AdminProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("adminToken");
  const userStr = localStorage.getItem("adminUser");
  const user = userStr ? JSON.parse(userStr) : null;

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
