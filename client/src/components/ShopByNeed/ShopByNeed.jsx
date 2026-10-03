import { useEffect, useState } from "react";

import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import { useLanguage } from "../../context/LanguageContext";
import SubcategoryRow from "../SubcategoryShowcase/SubcategoryRow";

// Complements SizeShowcase (which only ever shows "Size"/"Bed Size"
// groups) with the other half of the existing subcategory taxonomy --
// "By Material" and "By Type" -- the fastest way to turn this into a
// "what am I actually shopping for" discovery page rather than a plain
// catalogue, with zero new product tagging: every link here already
// resolves to a real, populated /category/:slug/:subSlug page today.
//
// Reuses SizeShowcase's own SubcategoryRow (image-card carousel, not a
// flat text-pill list) -- an earlier plain-pill version read as too
// basic for a homepage discovery section next to the photo-based
// sections around it; this keeps the same premium, consistent card
// treatment as SizeShowcase right above it, differing only in which
// subcategory groups feed it.
function ShopByNeed() {
  const [rows, setRows] = useState([]);
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

      const grouped = relevant.reduce((acc, sub) => {
        const category = categoryMap.get(sub.category?._id);
        if (!category) return acc;

        const key = `${category._id}:${sub.groupLabel}`;
        if (!acc[key]) {
          acc[key] = { category, groupLabel: sub.groupLabel, items: [] };
        }
        acc[key].items.push(sub);
        return acc;
      }, {});

      setRows(
        Object.values(grouped)
          .map((group) => ({
            ...group,
            items: group.items.sort((a, b) => a.displayOrder - b.displayOrder),
          }))
          .sort((a, b) => a.category.displayOrder - b.category.displayOrder),
      );
    };

    load();
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 space-y-12">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center -mb-2">
          {t("Shop by Need", "ज़रूरत के हिसाब से खरीदें")}
        </h2>

        {rows.map((row) => (
          <SubcategoryRow
            key={`${row.category._id}:${row.groupLabel}`}
            category={row.category}
            groupLabel={row.groupLabel}
            items={row.items}
            activeSubcategory={null}
          />
        ))}
      </div>
    </section>
  );
}

export default ShopByNeed;
