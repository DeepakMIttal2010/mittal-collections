import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { getCategories } from "../services/categoryService";
import { getSubcategories } from "../services/subcategoryService";

function MegaMenu({ linkClassName }) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [openCategoryId, setOpenCategoryId] = useState(null);

  const loadData = async () => {
    const [catRes, subcatRes] = await Promise.all([
      getCategories(),
      getSubcategories(),
    ]);

    if (catRes.success) setCategories(catRes.categories);
    if (subcatRes.success) setSubcategories(subcatRes.subcategories);
  };

  useEffect(() => {
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

  return (
    <>
      {categories.map((category) => {
        const groups = getGroupedSubcategories(category._id);
        const hasSubmenu = Object.keys(groups).length > 0;

        return (
          <div
            key={category._id}
            className="relative inline-block"
            onMouseEnter={() => setOpenCategoryId(category._id)}
            onMouseLeave={() => setOpenCategoryId(null)}
          >
            <NavLink
              to={`/category/${category.slug}`}
              className={
                linkClassName ||
                "text-sm font-medium px-4 py-3 text-slate-700 hover:text-amber-600"
              }
            >
              {category.name}
            </NavLink>

            {hasSubmenu && openCategoryId === category._id && (
              <div className="absolute top-full left-0 z-50 bg-white border border-slate-200 shadow-lg rounded-b-lg p-6 flex gap-10 min-w-max">
                {Object.entries(groups).map(([groupLabel, items]) => (
                  <div key={groupLabel} className="min-w-[160px]">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 border-b border-slate-100 pb-1">
                      {groupLabel}
                    </h4>

                    <ul className="space-y-1.5">
                      {items
                        .sort((a, b) => a.displayOrder - b.displayOrder)
                        .map((item) => (
                          <li key={item._id}>
                            <NavLink
                              to={`/category/${category.slug}/${item.slug}`}
                              className="text-sm text-slate-600 hover:text-amber-600 transition-colors block"
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
    </>
  );
}

export default MegaMenu;
