import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import { useLanguage } from "../../context/LanguageContext";

// Complements SizeShowcase (which only ever shows "Size"/"Bed Size"
// groups, as full image-carousel rows) with the other half of the
// existing subcategory taxonomy -- "By Material" and "By Type" -- the
// fastest way to turn this into a "what am I actually shopping for"
// discovery page rather than a plain catalogue, with zero new product
// tagging: every link here already resolves to a real, populated
// /category/:slug/:subSlug page today.
//
// Flat pills, not SizeShowcase's image-carousel-per-group treatment --
// there are ~35 of these across the catalogue (and growing as more
// categories gain subcategories), which reads fine as a wrapped tag
// grid but would be an unreasonably long page as 10+ more full
// carousel rows stacked under SizeShowcase.
function ShopByNeed() {
  const [groups, setGroups] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    const load = async () => {
      const [catRes, subRes] = await Promise.all([
        getCategories(),
        getSubcategories(),
      ]);

      if (!catRes.success || !subRes.success) return;

      const categoryMap = new Map(catRes.categories.map((c) => [c._id, c]));

      const relevant = subRes.subcategories.filter(
        (s) => s.groupLabel === "By Material" || s.groupLabel === "By Type",
      );

      const byCategory = new Map();
      for (const sub of relevant) {
        const category = categoryMap.get(sub.category?._id);
        if (!category) continue;

        if (!byCategory.has(category._id)) {
          byCategory.set(category._id, { category, items: [] });
        }
        byCategory.get(category._id).items.push(sub);
      }

      setGroups(
        [...byCategory.values()].sort(
          (a, b) => a.category.displayOrder - b.category.displayOrder,
        ),
      );
    };

    load();
  }, []);

  if (groups.length === 0) return null;

  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center mb-10">
          {t("Shop by Need", "ज़रूरत के हिसाब से खरीदें")}
        </h2>

        <div className="space-y-6">
          {groups.map(({ category, items }) => (
            <div key={category._id} className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm font-semibold text-slate-500 w-full sm:w-auto sm:min-w-28">
                {t(category.name, category.nameHi)}
              </span>

              {items.map((sub) => (
                <Link
                  key={sub._id}
                  to={`/category/${category.slug}/${sub.slug}`}
                  className="px-4 py-1.5 rounded-full border border-slate-300 bg-white text-sm text-slate-700 hover:border-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  {t(sub.name, sub.nameHi)}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ShopByNeed;
