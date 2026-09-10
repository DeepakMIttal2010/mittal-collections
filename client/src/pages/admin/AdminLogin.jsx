import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loginUser, saveAdminLogin } from "../../services/authService";
import { PERMISSION_GROUPS, permissionForPath } from "../../config/adminPermissions";
import "./AdminLogin.css";

function AdminLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/admin";

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);

    const response = await loginUser({
      email: formData.email,
      password: formData.password,
    });

    if (!response.success) {
      alert(response.message);
      setLoading(false);
      return;
    }

    if (response.user.role !== "admin") {
      alert("Access Denied. Admin only.");
      setLoading(false);
      return;
    }

    saveAdminLogin(response);

    // A restricted staff account whose role doesn't include the default
    // landing section (the dashboard, or wherever a redirect param sent
    // them) would hit RequirePermission's access-restricted page the
    // instant they log in — send them to the first section their role
    // actually grants instead.
    const permissions = response.user.adminRole?.permissions;
    const requiredKey = permissions ? permissionForPath(redirectTo) : null;

    if (permissions && !permissions.includes(requiredKey)) {
      const firstAllowed = PERMISSION_GROUPS.flatMap((g) => g.items).find(
        (item) => permissions.includes(item.key),
      );
      navigate(firstAllowed?.to || redirectTo);
    } else {
      navigate(redirectTo);
    }

    setLoading(false);
  };

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h2>Admin Login</h2>

        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
        />

        <button disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}

export default AdminLogin;
