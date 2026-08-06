import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  FaBell,
  FaSearch,
  FaUserCircle,
  FaUser,
  FaKey,
  FaSignOutAlt,
  FaChevronDown,
  FaShoppingCart,
  FaEnvelope,
  FaStar,
  FaQuestionCircle,
} from "react-icons/fa";

import { logoutUser } from "../../services/authService";
import {
  getNotifications,
  markAllNotificationsRead,
  markOrderSeen,
  markMessageRead,
} from "../../services/adminNotificationService";
import { markReviewSeen } from "../../services/adminReviewService";
import { markQuestionSeen } from "../../services/adminQuestionService";

import "./AdminHeader.css";

const POLL_INTERVAL_MS = 30000;

const timeAgo = (dateString) => {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

function AdminHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);

  const user = JSON.parse(localStorage.getItem("user"));

  const loadNotifications = async () => {
    const response = await getNotifications();

    if (response.success) {
      setNotifications(response.notifications);
      setTotalUnread(response.totalUnread);
    }
  };

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const handleNotificationClick = async (item) => {
    setShowNotifications(false);

    if (item.type === "order") {
      await markOrderSeen(item.id);
    } else if (item.type === "message") {
      await markMessageRead(item.id);
    } else if (item.type === "review") {
      await markReviewSeen(item.id);
    } else if (item.type === "question") {
      await markQuestionSeen(item.id);
    }

    loadNotifications();
    navigate(item.link);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    loadNotifications();
  };

  const SECTION_LABELS = {
    products: "Products",
    categories: "Categories",
    subcategories: "Sub Categories",
    testimonials: "Testimonials",
    reviews: "Reviews",
    questions: "Questions & Answers",
    pages: "Pages",
    settings: "Settings",
    newsletter: "Newsletter",
    messages: "Contact Messages",
    "footer-links": "Footer Links",
    banners: "Home Banners",
    "price-ranges": "Shop by Price",
    coupons: "Coupons",
    orders: "Orders",
    customers: "Customers",
    reports: "Reports",
    profile: "My Profile",
    "change-password": "Change Password",
  };

  const SINGULAR_LABELS = {
    products: "Product",
    categories: "Category",
  };

  const getBreadcrumb = () => {
    const segments = location.pathname.split("/").filter(Boolean).slice(1); // drop leading "admin"

    if (segments.length === 0) return [{ label: "Dashboard" }];

    const [section, subSegment] = segments;
    const sectionLabel = SECTION_LABELS[section] || "Admin Panel";
    const listPath = `/admin/${section}`;

    if (segments.length === 1) return [{ label: sectionLabel }];

    if (section === "customers") {
      return [
        { label: sectionLabel, path: listPath },
        { label: "Customer Details" },
      ];
    }

    if (subSegment === "bulk-import") {
      return [
        { label: sectionLabel, path: listPath },
        { label: "Bulk Import" },
      ];
    }

    if (subSegment === "add" || subSegment === "edit") {
      const action = subSegment === "add" ? "Add" : "Edit";
      const noun = SINGULAR_LABELS[section] || sectionLabel;

      return [
        { label: sectionLabel, path: listPath },
        { label: `${action} ${noun}` },
      ];
    }

    return [{ label: sectionLabel }];
  };

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to logout?")) return;

    logoutUser();

    navigate("/admin/login");
  };

  return (
    <header className="admin-header">
      <div className="header-left">
        <h2 className="admin-breadcrumb">
          {getBreadcrumb().map((crumb, idx, arr) => (
            <span key={idx}>
              {idx > 0 && <span className="breadcrumb-separator">›</span>}
              {crumb.path ? (
                <span
                  className="breadcrumb-link"
                  onClick={() => navigate(crumb.path)}
                >
                  {crumb.label}
                </span>
              ) : (
                <span
                  className={
                    idx === arr.length - 1 ? "breadcrumb-current" : undefined
                  }
                >
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </h2>
      </div>

      <div className="header-center">
        <div className="search-box">
          <FaSearch />

          <input type="text" placeholder="Search..." />
        </div>
      </div>

      <div className="header-right">
        <div style={{ position: "relative" }}>
          <button
            className="notification-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowMenu(false);
            }}
          >
            <FaBell />

            {totalUnread > 0 && (
              <span className="notification-badge">
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute top-[65px] right-0 w-80 bg-white rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h4 className="font-semibold text-slate-800 text-sm">
                  Notifications
                </h4>

                {totalUnread > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">
                    No new notifications
                  </p>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleNotificationClick(item)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-b-0"
                    >
                      <span
                        className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          item.type === "order"
                            ? "bg-blue-100 text-blue-600"
                            : item.type === "review"
                              ? "bg-amber-100 text-amber-600"
                              : item.type === "question"
                                ? "bg-purple-100 text-purple-600"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.type === "order" ? (
                          <FaShoppingCart className="text-xs" />
                        ) : item.type === "review" ? (
                          <FaStar className="text-xs" />
                        ) : item.type === "question" ? (
                          <FaQuestionCircle className="text-xs" />
                        ) : (
                          <FaEnvelope className="text-xs" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.subtitle}
                        </p>
                      </div>

                      <span className="text-xs text-slate-400 shrink-0">
                        {timeAgo(item.createdAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className="profile-section"
          onClick={() => {
            setShowMenu(!showMenu);
            setShowNotifications(false);
          }}
        >
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
