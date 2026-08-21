import { NavLink } from "react-router-dom";
import { FaBell, FaFire, FaTag } from "react-icons/fa";
import MegaMenu from "../MegaMenu";

// Mobile no longer gets this row at all — the "Categories" tab in
// BottomNav (MainLayout.jsx) replaces it with a persistent, thumb-reachable
// bottom bar instead of a one-off "☰ Menu" link buried in the navbar.
function Navbar() {
  const linkClass = ({ isActive }) =>
    `text-sm font-medium px-4 py-3 transition-colors ${
      isActive ? "text-amber-600" : "text-slate-700 hover:text-amber-600"
    }`;

  return (
    <nav className="hidden md:block bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 flex items-center">
        <div className="flex items-center">
          <NavLink to="/" className={linkClass}>
            Home
          </NavLink>

          {/* Dynamic categories + subcategories mega menu */}
          <MegaMenu linkClassName={linkClass} />

          <NavLink
            to="/trending"
            className={({ isActive }) =>
              `flex items-center gap-1.5 ${linkClass({ isActive })}`
            }
          >
            <FaFire className="text-xs text-amber-500" />
            Top Trending
          </NavLink>

          <NavLink
            to="/clearance-sale"
            className={({ isActive }) =>
              `flex items-center gap-1.5 ${linkClass({ isActive })}`
            }
          >
            <FaTag className="text-xs text-red-600" />
            Clearance Sale
          </NavLink>

          <NavLink
            to="/new-arrivals"
            className={({ isActive }) =>
              `flex items-center gap-1.5 ${linkClass({ isActive })}`
            }
          >
            <FaBell className="text-xs text-amber-500" />
            New Arrivals
          </NavLink>

          <NavLink to="/articles" className={linkClass}>
            Guides
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
