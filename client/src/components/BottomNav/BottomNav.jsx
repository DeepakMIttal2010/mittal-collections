import { NavLink } from "react-router-dom";
import { FaHome, FaTh, FaShoppingCart, FaUser } from "react-icons/fa";

import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

// Persistent mobile bottom tab bar (Flipkart/Amazon-style) — replaces the
// old "☰ Menu" row that used to sit inside Navbar. Thumb-reachable nav
// beats a menu link buried at the top of a tall scrolling page.
function BottomNav({ onOpenCategories, categoriesOpen }) {
  const { totalItems, openCart } = useCart();
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();

  const tabClass = (active) =>
    `flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
      active ? "text-amber-600" : "text-slate-500"
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <NavLink to="/" end className={({ isActive }) => tabClass(isActive) + " py-2"}>
        <FaHome className="text-lg" />
        {t("Home", "होम")}
      </NavLink>

      <button
        type="button"
        onClick={onOpenCategories}
        className={tabClass(categoriesOpen) + " py-2"}
      >
        <FaTh className="text-lg" />
        {t("Categories", "श्रेणियां")}
      </button>

      <button
        type="button"
        onClick={openCart}
        className={tabClass(false) + " relative py-2"}
      >
        <span className="relative">
          <FaShoppingCart className="text-lg" />
          {totalItems > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {totalItems > 9 ? "9+" : totalItems}
            </span>
          )}
        </span>
        {t("Cart", "कार्ट")}
      </button>

      <NavLink
        to={isLoggedIn ? "/account" : "/login"}
        className={({ isActive }) => tabClass(isActive) + " py-2"}
      >
        <FaUser className="text-lg" />
        {t("Account", "खाता")}
      </NavLink>
    </nav>
  );
}

export default BottomNav;
