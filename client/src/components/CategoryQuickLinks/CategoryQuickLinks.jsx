import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getCategories } from "../../services/categoryService";
import { imgUrl } from "../../services/api";
import { useLanguage } from "../../context/LanguageContext";
import { handleImageError } from "../../utils/imageFallback";

// A compact, always-visible "what are you looking for" row right below
// the hero -- lets a first-time visitor jump straight to a category
// within seconds, without waiting to scroll to Categories' full
// photo-card grid further down the page. Circular real-product-photo
// thumbnails (the category's own image, already used by Categories.jsx
// and the admin panel -- no new data needed), not generic icons --
// matches the category-row pattern on Flipkart/Myntra/Amazon, and
// means every thumbnail is unambiguously the right picture for that
// category rather than an icon that has to stand in for it.
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
    <div className="bg-white border-b border-slate-100 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500 mb-5">
          {t("What are you looking for?", "आप क्या ढूंढ रहे हैं?")}
        </h2>

        <div className="flex gap-5 sm:gap-7 overflow-x-auto sm:flex-wrap sm:justify-center sm:overflow-visible pb-2 px-1 -mx-1">
          {categories.map((category) => (
            <Link
              key={category._id}
              to={`/category/${category.slug}`}
              className="group flex flex-col items-center gap-2 shrink-0 w-16 sm:w-20"
            >
              <span className="block w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border border-slate-200 group-hover:border-amber-400 transition-colors">
                <img
                  src={imgUrl(category.image, "w_120,h_120,c_fill,g_auto,q_auto,f_auto")}
                  alt={t(category.name, category.nameHi)}
                  loading="lazy"
                  onError={handleImageError}
                  className="w-full h-full object-cover"
                />
              </span>
              <span className="text-xs sm:text-sm font-medium text-slate-700 text-center leading-tight group-hover:text-amber-700">
                {t(category.name, category.nameHi)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CategoryQuickLinks;
