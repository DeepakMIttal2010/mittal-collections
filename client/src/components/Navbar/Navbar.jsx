import { NavLink } from "react-router-dom";
import { FaBell, FaFire, FaTag } from "react-icons/fa";
import MegaMenu from "../MegaMenu";

// Mobile no longer gets this row at all — the "Categories" tab in
// BottomNav (MainLayout.jsx) replaces it with a persistent, thumb-reachable
// bottom bar instead of a one-off "☰ Menu" link buried in the navbar.
function Navbar() {
  // Padding shrinks at md/lg and only grows back past 1440px — with ~10
  // items (Home + up to 5 categories + More + Top Trending + Clearance
  // Sale + New Arrivals + Guides) at a flat px-4, this row only ever fit
  // starting around ~1450px; a 14" laptop's *effective* CSS width is
  // commonly 1280-1366px after Windows display scaling. Tailwind's `xl`
  // breakpoint starts at 1280px, so `xl:px-4` used to land the widest
  // padding right inside that same 1280-1366px zone — undoing the fix
  // exactly where it mattered. Pushed to an arbitrary 1440px breakpoint
  // so the wider padding only kicks in once it's actually safe. (A
  // horizontal-scroll fallback was tried too, but any overflow value
  // other than visible on this row clips the category dropdowns — they
  // render via top-full below it, and an ancestor's overflow clips
  // absolutely-positioned descendants regardless of which nearer element
  // establishes their own positioning context. The padding fix alone is
  // enough, so overflow stays at its default.)
  const linkClass = ({ isActive }) =>
    `text-sm font-medium px-2 lg:px-3 min-[1440px]:px-4 py-3 whitespace-nowrap transition-colors ${
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
