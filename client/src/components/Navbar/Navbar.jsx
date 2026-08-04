import { NavLink } from "react-router-dom";
import MegaMenu from "../MegaMenu";
import MobileMenu from "../MobileMenu";

function Navbar() {
  const linkClass = ({ isActive }) =>
    `text-sm font-medium px-4 py-3 transition-colors ${
      isActive ? "text-amber-600" : "text-slate-700 hover:text-amber-600"
    }`;

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 flex items-center">
        <div className="md:hidden">
          <MobileMenu />
        </div>

        <div className="hidden md:flex items-center">
          <NavLink to="/" className={linkClass}>
            Home
          </NavLink>

          {/* Dynamic categories + subcategories mega menu */}
          <MegaMenu linkClassName={linkClass} />
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
