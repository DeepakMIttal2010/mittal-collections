import { Navigate } from "react-router-dom";

function AdminProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  // Login nahi hai -> admin login pe bhejo
  if (!token || !user) {
    return <Navigate to="/admin/login" replace />;
  }

  // Login hai but admin nahi hai -> admin login pe bhejo
  if (user.role !== "admin") {
    return <Navigate to="/admin/login" replace />;
  }

  // Sab sahi hai -> admin content dikhao
  return children;
}

export default AdminProtectedRoute;
