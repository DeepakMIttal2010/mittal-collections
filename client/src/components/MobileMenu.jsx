import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FaTimes,
  FaChevronDown,
  FaChevronUp,
  FaBell,
  FaFire,
  FaTag,
} from "react-icons/fa";

import { getCategories } from "../services/categoryService";
import { getSubcategories } from "../services/subcategoryService";
import { useLanguage } from "../context/LanguageContext";

// Controlled drawer — open state lives in MainLayout so BottomNav's
// "Categories" tab can open the same drawer instead of each owning a
// separate copy of the categories/subcategories fetch and expand state.
function MobileMenu({ isOpen, onClose }) {
  const { language, t } = useLanguage();
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [openCategoryId, setOpenCategoryId] = useState(null);

  // Guides has a genuinely separate Hindi URL — see Navbar.jsx's comment.
  const guidesPath = language === "hi" ? "/hi/articles" : "/articles";

  useEffect(() => {
    const loadData = async () => {
      const [catRes, subcatRes] = await Promise.all([
        getCategories(),
        getSubcategories(),
      ]);

      if (catRes.success) setCategories(catRes.categories);
      if (subcatRes.success) setSubcategories(subcatRes.subcategories);
    };

    loadData();
  }, []);

  const getGroupedSubcategories = (categoryId) => {
    const items = subcategories.filter(
      (sub) => sub.category?._id === categoryId,
    );

    const groups = {};

    items.forEach((item) => {
      if (!groups[item.groupLabel]) {
        groups[item.groupLabel] = [];
      }
      groups[item.groupLabel].push(item);
    });

    return groups;
  };

  const close = () => {
    onClose();
    setOpenCategoryId(null);
  };

  const toggleCategory = (id) => {
    setOpenCategoryId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 bg-black/40 z-[100] transition-opacity md:hidden ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Standard ~88% partial-width drawer, not full-screen — the dim
          overlay above (z-[100], covers the full viewport) already sits
          above BottomNav (z-40), so BottomNav shows through dimmed in the
          remaining gap rather than peeking through undimmed. */}
      <div
        className={`fixed top-0 left-0 h-full w-[88%] max-w-sm bg-white z-[101] shadow-xl flex flex-col transition-transform duration-300 md:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">{t("Menu", "मेनू")}</h2>

          <button
            type="button"
            onClick={close}
            aria-label={t("Close menu", "मेनू बंद करें")}
            className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <NavLink
            to="/"
            onClick={close}
            className="block px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600"
          >
            {t("Home", "होम")}
          </NavLink>

          {categories.map((category) => {
            const groups = getGroupedSubcategories(category._id);
            const hasSubmenu = Object.keys(groups).length > 0;
            const isExpanded = openCategoryId === category._id;

            return (
              <div key={category._id} className="border-t border-slate-100">
                <div className="flex items-center">
                  <NavLink
                    to={`/category/${category.slug}`}
                    onClick={close}
                    className="flex-1 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {category.name}
                  </NavLink>

                  {hasSubmenu && (
                    <button
                      type="button"
                      onClick={() => toggleCategory(category._id)}
                      aria-label={t(
                        `${isExpanded ? "Collapse" : "Expand"} ${category.name}`,
                        `${category.name} ${isExpanded ? "संकुचित करें" : "विस्तृत करें"}`,
                      )}
                      className="px-4 py-3 text-slate-400"
                    >
                      {isExpanded ? (
                        <FaChevronUp className="text-xs" />
                      ) : (
                        <FaChevronDown className="text-xs" />
                      )}
                    </button>
                  )}
                </div>

                {hasSubmenu && isExpanded && (
                  <div className="bg-slate-50 pb-2">
                    {Object.entries(groups).map(([groupLabel, items]) => (
                      <div key={groupLabel} className="px-5 py-2">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                          {groupLabel}
                        </h4>

                        <ul className="space-y-1">
                          {items
                            .sort((a, b) => a.displayOrder - b.displayOrder)
                            .map((item) => (
                              <li key={item._id}>
                                <NavLink
                                  to={`/category/${category.slug}/${item.slug}`}
                                  onClick={close}
                                  className="block py-1.5 text-sm text-slate-600 hover:text-amber-600"
                                >
                                  {item.name}
                                </NavLink>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <NavLink
            to="/trending"
            onClick={close}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600 border-t border-slate-100"
          >
            <FaFire className="text-amber-500" />
            {t("Top Trending", "टॉप ट्रेंडिंग")}
          </NavLink>

          <NavLink
            to="/clearance-sale"
            onClick={close}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600 border-t border-slate-100"
          >
            <FaTag className="text-red-600" />
            {t("Clearance Sale", "क्लियरेंस सेल")}
          </NavLink>

          <NavLink
            to="/new-arrivals"
            onClick={close}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600 border-t border-slate-100"
          >
            <FaBell className="text-amber-500" />
            {t("New Arrivals", "नई आवक")}
          </NavLink>

          <NavLink
            to={guidesPath}
            onClick={close}
            className="block px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600 border-t border-slate-100"
          >
            {t("Guides", "गाइड")}
          </NavLink>
        </div>
      </div>
    </>
  );
}

export default MobileMenu;
