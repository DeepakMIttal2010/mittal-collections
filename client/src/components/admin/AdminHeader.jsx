import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  FaBell,
  FaSearch,
  FaUserCircle,
  FaUser,
  FaKey,
  FaSignOutAlt,
  FaChevronDown,
} from "react-icons/fa";

import { logoutUser } from "../../services/authService";

import "./AdminHeader.css";

function AdminHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const [showMenu, setShowMenu] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));

  const getTitle = () => {
    if (location.pathname === "/admin") return "Dashboard";
    if (location.pathname.includes("products")) return "Products";
    if (location.pathname.includes("categories")) return "Categories";
    if (location.pathname.includes("orders")) return "Orders";
    if (location.pathname.includes("customers")) return "Customers";
    if (location.pathname.includes("reports")) return "Reports";
    if (location.pathname.includes("settings")) return "Settings";
    return "Admin Panel";
  };

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;

    logoutUser();

    navigate("/admin/login");
  };

  return (
    <header className="admin-header">
      <div className="header-left">
        <h2>{getTitle()}</h2>
      </div>

      <div className="header-center">
        <div className="search-box">
          <FaSearch />

          <input type="text" placeholder="Search..." />
        </div>
      </div>

      <div className="header-right">
        <button className="notification-btn">
          <FaBell />

          <span className="notification-badge">3</span>
        </button>

        <div className="profile-section" onClick={() => setShowMenu(!showMenu)}>
          <FaUserCircle className="profile-icon" />

          <div className="profile-info">
            <span>{user?.name}</span>

            <small>{user?.role}</small>
          </div>

          <FaChevronDown className="dropdown-icon" />

          {showMenu && (
            <div className="profile-dropdown">
              <button onClick={() => navigate("/admin/profile")}>
                <FaUser />
                My Profile
              </button>

              <button onClick={() => navigate("/admin/change-password")}>
                <FaKey />
                Change Password
              </button>

              <hr />

              <button className="logout-option" onClick={handleLogout}>
                <FaSignOutAlt />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;
