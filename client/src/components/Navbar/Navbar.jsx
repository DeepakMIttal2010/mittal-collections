import { NavLink } from "react-router-dom";
import { FaBell, FaFire, FaTag } from "react-icons/fa";
import MegaMenu from "../MegaMenu";

// Mobile no longer gets this row at all — the "Categories" tab in
// BottomNav (MainLayout.jsx) replaces it with a persistent, thumb-reachable
// bottom bar instead of a one-off "☰ Menu" link buried in the navbar.
function Navbar() {
  // Padding shrinks at md/lg before growing back at xl — with ~10 items
  // (Home + up to 5 categories + More + Top Trending + Clearance Sale +
  // New Arrivals + Guides) at a flat px-4, this row only ever fit
  // starting around ~1450px; a 14" laptop's *effective* CSS width is
  // commonly 1280-1366px after Windows display scaling, which sat in a
  // gap this component never accounted for and wrapped into a broken
  // second line. flex-nowrap + overflow-x-auto is also a deliberate
  // safety net — if it ever doesn't fit even at the smallest padding,
  // it scrolls horizontally instead of silently wrapping again.
  const linkClass = ({ isActive }) =>
    `text-sm font-medium px-2 lg:px-3 xl:px-4 py-3 whitespace-nowrap transition-colors ${
      isActive ? "text-amber-600" : "text-slate-700 hover:text-amber-600"
    }`;

  return (
    <nav className="hidden md:block bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 flex items-center flex-nowrap overflow-x-auto">
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
