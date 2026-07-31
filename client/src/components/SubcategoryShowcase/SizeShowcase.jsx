import { useEffect, useState } from "react";

import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import SubcategoryRow from "./SubcategoryRow";

function SizeShowcase() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [catRes, subRes] = await Promise.all([
        getCategories(),
        getSubcategories(),
      ]);

      if (!catRes.success || !subRes.success) return;

      const categoryMap = {};
      catRes.categories.forEach((cat) => {
        categoryMap[cat._id] = cat;
      });

      const bySize = subRes.subcategories.filter((sub) =>
        /size/i.test(sub.groupLabel || ""),
      );

      const grouped = bySize.reduce((acc, sub) => {
        const categoryId = sub.category?._id;
        const category = categoryMap[categoryId];
        if (!category) return acc;

        if (!acc[categoryId]) {
          acc[categoryId] = { category, groupLabel: sub.groupLabel, items: [] };
        }
        acc[categoryId].items.push(sub);
        return acc;
      }, {});

      setRows(
        Object.values(grouped).map((group) => ({
          ...group,
          items: group.items.sort((a, b) => a.displayOrder - b.displayOrder),
        })),
      );
    };

    load();
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 space-y-12">
        {rows.map((row) => (
          <SubcategoryRow
            key={row.category._id}
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

export default SizeShowcase;
