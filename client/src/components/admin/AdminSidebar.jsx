import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  FaTachometerAlt,
  FaBoxOpen,
  FaTags,
  FaShoppingCart,
  FaUsers,
  FaChartLine,
  FaCog,
  FaSignOutAlt,
  FaCommentDots,
  FaPaperPlane,
  FaFileAlt,
  FaNewspaper,
  FaAward,
  FaEnvelopeOpenText,
  FaLink,
  FaImages,
  FaTag,
  FaPercent,
  FaStar,
  FaQuestionCircle,
  FaFileImport,
  FaTicketAlt,
  FaUndoAlt,
  FaQrcode,
  FaBook,
  FaChevronDown,
  FaLayerGroup,
} from "react-icons/fa";

import { logoutAdmin, getCurrentAdminUser } from "../../services/authService";

import "./AdminSidebar.css";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/admin", end: true, icon: FaTachometerAlt, label: "Dashboard" },
      { to: "/admin/reports", icon: FaChartLine, label: "Reports" },
      { to: "/admin/walkthrough", icon: FaBook, label: "Product Walkthrough" },
    ],
  },
  {
    label: "Catalog & Stock",
    items: [
      { to: "/admin/products", icon: FaBoxOpen, label: "Products & Stock" },
      { to: "/admin/products/bulk-import", icon: FaFileImport, label: "Bulk Import" },
      { to: "/admin/print-labels", icon: FaQrcode, label: "Print QR Labels" },
      { to: "/admin/categories", icon: FaTags, label: "Categories" },
      { to: "/admin/subcategories", icon: FaTags, label: "Sub Categories" },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/admin/orders", icon: FaShoppingCart, label: "Orders" },
      { to: "/admin/pos", icon: FaShoppingCart, label: "POS Cart" },
      { to: "/admin/coupons", icon: FaPercent, label: "Coupons" },
      { to: "/admin/returns", icon: FaUndoAlt, label: "Returns" },
    ],
  },
  {
    label: "Customers",
    items: [
      { to: "/admin/customers", icon: FaUsers, label: "Customers" },
      { to: "/admin/rewards-settings", icon: FaAward, label: "Rewards Settings" },
      { to: "/admin/testimonials", icon: FaCommentDots, label: "Testimonials" },
      { to: "/admin/reviews", icon: FaStar, label: "Reviews" },
      { to: "/admin/questions", icon: FaQuestionCircle, label: "Questions" },
    ],
  },
  {
    label: "Content & Marketing",
    items: [
      { to: "/admin/banners", icon: FaImages, label: "Home Banners" },
      { to: "/admin/new-arrivals", icon: FaLayerGroup, label: "New Arrivals by Category" },
      { to: "/admin/price-ranges", icon: FaTag, label: "Shop by Price" },
      { to: "/admin/pages", icon: FaFileAlt, label: "Site Content" },
      { to: "/admin/articles", icon: FaNewspaper, label: "Articles" },
      { to: "/admin/footer-links", icon: FaLink, label: "Footer Links" },
      { to: "/admin/newsletter", icon: FaPaperPlane, label: "Newsletter" },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/admin/messages", icon: FaEnvelopeOpenText, label: "Messages" },
      { to: "/admin/tickets", icon: FaTicketAlt, label: "Support Tickets" },
    ],
  },
  {
    label: "Configuration",
    items: [{ to: "/admin/settings", icon: FaCog, label: "Settings" }],
  },
];

// A group starts open if the page currently being viewed lives inside it —
// otherwise the sidebar always opens on Dashboard with everything else
// collapsed, defeating the point of grouping.
const groupContainingPath = (pathname) =>
  NAV_GROUPS.find((group) =>
    group.items.some((item) =>
      item.end ? pathname === item.to : pathname.startsWith(item.to),
    ),
  )?.label;

function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = getCurrentAdminUser();

  const [openGroup, setOpenGroup] = useState(
    () => groupContainingPath(location.pathname) || NAV_GROUPS[0].label,
  );

  const handleLogout = () => {
    const confirmLogout = window.confirm("Are you sure you want to logout?");

    if (!confirmLogout) return;

    logoutAdmin();

    navigate("/admin/login");
  };

  return (
    <aside className="admin-sidebar">
      <div className="sidebar-logo">
        <h2>Mittal Collections</h2>

        <span>Admin Panel</span>
      </div>

      <div className="admin-user">
        <div className="avatar">{user?.name?.charAt(0).toUpperCase()}</div>

        <div>
          <h4>{user?.name}</h4>

          <p>{user?.role}</p>
        </div>
      </div>

      <nav>
        {NAV_GROUPS.map((group) => {
          const isOpen = openGroup === group.label;

          return (
            <div key={group.label} className="sidebar-group">
              <button
                type="button"
                className="sidebar-group-label"
                aria-expanded={isOpen}
                onClick={() => setOpenGroup(isOpen ? null : group.label)}
              >
                <span>{group.label}</span>
                <FaChevronDown
                  className={`sidebar-group-chevron ${isOpen ? "open" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="sidebar-group-items">
                  {group.items.map(({ to, end, icon: Icon, label }) => (
                    <NavLink key={to} end={end} to={to}>
                      <Icon />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button className="logout-btn" onClick={handleLogout}>
        <FaSignOutAlt />
        Logout
      </button>
    </aside>
  );
}

export default AdminSidebar;
