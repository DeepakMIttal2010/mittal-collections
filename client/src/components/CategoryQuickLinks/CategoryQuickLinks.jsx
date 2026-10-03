import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaBed,
  FaCloud,
  FaWindowMaximize,
  FaCouch,
  FaTshirt,
  FaMoon,
  FaDoorOpen,
  FaHotel,
  FaShieldAlt,
  FaUtensils,
  FaRulerHorizontal,
  FaBath,
  FaPuzzlePiece,
  FaHome,
} from "react-icons/fa";

import { getCategories } from "../../services/categoryService";
import { useLanguage } from "../../context/LanguageContext";

// No icon field exists on the Category model (and adding one is real
// admin-facing scope, not a quick visual pass) -- a client-side slug map
// gets the "What are you looking for?" grid its icons today. Font
// Awesome (react-icons/fa), not emoji -- matches the icon system already
// used everywhere else on the site (ProductCard, Header, etc.) instead
// of introducing a second, more casual visual language. DEFAULT_ICON
// below is deliberately generic (not a wrong/misleading picture) so a
// newly-added category added before this map is updated still reads
// fine rather than showing nothing.
const CATEGORY_ICON = {
  bedsheets: FaBed,
  comforters: FaCloud,
  curtains: FaWindowMaximize,
  "cushion-covers": FaTshirt,
  cushions: FaCouch,
  dohars: FaMoon,
  doormats: FaDoorOpen,
  "hotel-linen": FaHotel,
  "mattress-covers": FaShieldAlt,
  "table-covers": FaUtensils,
  "table-runners": FaRulerHorizontal,
  towels: FaBath,
  toys: FaPuzzlePiece,
};
const DefaultIcon = FaHome;

// A compact, always-visible "what are you looking for" grid right below
// the hero -- lets a first-time visitor jump straight to a category
// within seconds, without waiting to scroll to Categories' full
// photo-card grid further down the page. Icon+text, not photos, so it
// stays this quick/compact rather than duplicating Categories.jsx's
// richer treatment.
function CategoryQuickLinks() {
  const [categories, setCategories] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    const loadCategories = async () => {
      const response = await getCategories();

      if (response.success) setCategories(response.categories);
    };

    loadCategories();
  }, []);

  if (categories.length === 0) return null;

  return (
    <div className="bg-white border-b border-slate-100 py-7 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500 mb-5">
          {t("What are you looking for?", "आप क्या ढूंढ रहे हैं?")}
        </h2>

        <div className="flex flex-wrap items-stretch justify-center gap-3 sm:gap-5">
          {categories.map((category) => {
            const Icon = CATEGORY_ICON[category.slug] || DefaultIcon;

            return (
              <Link
                key={category._id}
                to={`/category/${category.slug}`}
                className="group flex flex-col items-center gap-2 w-20 sm:w-24"
              >
                <span className="flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-50 border border-slate-200 text-slate-600 group-hover:bg-amber-50 group-hover:border-amber-400 group-hover:text-amber-600 transition-colors">
                  <Icon className="text-xl sm:text-2xl" aria-hidden="true" />
                </span>
                <span className="text-xs sm:text-sm font-medium text-slate-700 text-center leading-tight group-hover:text-amber-700">
                  {t(category.name, category.nameHi)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CategoryQuickLinks;
