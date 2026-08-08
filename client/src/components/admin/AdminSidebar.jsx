import { NavLink, useNavigate } from "react-router-dom";

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
} from "react-icons/fa";

import { logoutUser } from "../../services/authService";

import "./AdminSidebar.css";

function AdminSidebar() {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));

  const handleLogout = () => {
    const confirmLogout = window.confirm("Are you sure you want to logout?");

    if (!confirmLogout) return;

    logoutUser();

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
        <NavLink end to="/admin">
          <FaTachometerAlt />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/admin/products">
          <FaBoxOpen />
          <span>Products</span>
        </NavLink>

        <NavLink to="/admin/products/bulk-import">
          <FaFileImport />
          <span>Bulk Import</span>
        </NavLink>

        <NavLink to="/admin/banners">
          <FaImages />
          <span>Home Banners</span>
        </NavLink>

        <NavLink to="/admin/price-ranges">
          <FaTag />
          <span>Shop by Price</span>
        </NavLink>

        <NavLink to="/admin/coupons">
          <FaPercent />
          <span>Coupons</span>
        </NavLink>

        <NavLink to="/admin/categories">
          <FaTags />
          <span>Categories</span>
        </NavLink>

        <NavLink to="/admin/subcategories">
          <FaTags />
          <span>Sub Categories</span>
        </NavLink>

        <NavLink to="/admin/testimonials">
          <FaCommentDots />
          <span>Testimonials</span>
        </NavLink>

        <NavLink to="/admin/reviews">
          <FaStar />
          <span>Reviews</span>
        </NavLink>

        <NavLink to="/admin/questions">
          <FaQuestionCircle />
          <span>Questions</span>
        </NavLink>

        <NavLink to="/admin/pages">
          <FaFileAlt />
          <span>Site Content</span>
        </NavLink>

        <NavLink to="/admin/articles">
          <FaNewspaper />
          <span>Articles</span>
        </NavLink>

        <NavLink to="/admin/footer-links">
          <FaLink />
          <span>Footer Links</span>
        </NavLink>

        <NavLink to="/admin/messages">
          <FaEnvelopeOpenText />
          <span>Messages</span>
        </NavLink>

        <NavLink to="/admin/tickets">
          <FaTicketAlt />
          <span>Support Tickets</span>
        </NavLink>

        <NavLink to="/admin/returns">
          <FaUndoAlt />
          <span>Returns</span>
        </NavLink>

        <NavLink to="/admin/orders">
          <FaShoppingCart />
          <span>Orders</span>
        </NavLink>

        <NavLink to="/admin/customers">
          <FaUsers />
          <span>Customers</span>
        </NavLink>

        <NavLink to="/admin/reports">
          <FaChartLine />
          <span>Reports</span>
        </NavLink>

        <NavLink to="/admin/newsletter">
          <FaPaperPlane />
          <span>Newsletter</span>
        </NavLink>

        <NavLink to="/admin/rewards-settings">
          <FaAward />
          <span>Rewards Settings</span>
        </NavLink>

        <NavLink to="/admin/settings">
          <FaCog />
          <span>Settings</span>
        </NavLink>
      </nav>

      <button className="logout-btn" onClick={handleLogout}>
        <FaSignOutAlt />
        Logout
      </button>
    </aside>
  );
}

export default AdminSidebar;
