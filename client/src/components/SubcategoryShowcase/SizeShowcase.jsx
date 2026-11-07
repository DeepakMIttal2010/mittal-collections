import { useEffect, useState } from "react";

import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import { selectSizeRows } from "../../utils/sizeShowcase";
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

      // Which rows and sizes: see HOME_SIZE_ROWS in utils/sizeShowcase.js.
      setRows(selectSizeRows(catRes.categories, subRes.subcategories));
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
