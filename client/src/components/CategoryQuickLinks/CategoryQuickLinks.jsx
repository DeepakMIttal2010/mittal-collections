import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getCategories } from "../../services/categoryService";
import { useLanguage } from "../../context/LanguageContext";

// A compact, always-visible row of category links right below the hero —
// lets a first-time visitor see what the store actually sells within
// seconds, without waiting to scroll to the full Categories section.
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
    <div className="bg-white border-b border-slate-100 py-3 px-4">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {categories.map((category, i) => (
          <span key={category._id} className="flex items-center gap-2 sm:gap-3">
            {i > 0 && <span className="text-slate-300">|</span>}
            <Link
              to={`/category/${category.slug}`}
              className="text-sm font-medium text-slate-700 hover:text-amber-600 transition-colors"
            >
              {t(category.name, category.nameHi)}
            </Link>
          </span>
        ))}
      </div>
    </div>
  );
}

export default CategoryQuickLinks;
