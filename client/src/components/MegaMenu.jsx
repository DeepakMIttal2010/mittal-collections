import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { FaChevronDown } from "react-icons/fa";

import { getCategories } from "../services/categoryService";
import { getSubcategories } from "../services/subcategoryService";

// How many categories show as their own top-level nav link (in the
// admin-set displayOrder/priority the categories API already returns)
// before the rest collapse into a "More" dropdown — keeps the navbar
// width stable as the category count grows.
const VISIBLE_COUNT = 5;

function useGroupedSubcategories(subcategories) {
  return (categoryId) => {
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
}

function SubmenuPanel({ category, groups }) {
  const hasSubmenu = Object.keys(groups).length > 0;

  if (!hasSubmenu) return null;

  return (
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
  );
}

function CategoryNavItem({ category, groups, linkClassName }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
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

      {isOpen && <SubmenuPanel category={category} groups={groups} />}
    </div>
  );
}

function MoreCategoriesMenu({ categories, getGroupedSubcategories, linkClassName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  useEffect(() => {
    if (isOpen && categories.length > 0 && !activeCategoryId) {
      setActiveCategoryId(categories[0]._id);
    }
  }, [isOpen, categories, activeCategoryId]);

  const activeCategory = categories.find((c) => c._id === activeCategoryId);
  const groups = activeCategory
    ? getGroupedSubcategories(activeCategory._id)
    : {};
  const hasSubmenu = Object.keys(groups).length > 0;

  if (categories.length === 0) return null;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className={
          linkClassName
            ? `flex items-center gap-1.5 ${linkClassName({ isActive: false })}`
            : "flex items-center gap-1.5 text-sm font-medium px-4 py-3 text-slate-700 hover:text-amber-600"
        }
      >
        More
        <FaChevronDown className="text-[10px]" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 bg-white border border-slate-200 shadow-lg rounded-b-lg flex min-w-[560px]">
          <div className="w-48 border-r border-slate-100 py-2 shrink-0">
            {categories.map((category) => (
              <NavLink
                key={category._id}
                to={`/category/${category.slug}`}
                onMouseEnter={() => setActiveCategoryId(category._id)}
                className={`block px-4 py-2.5 text-sm transition-colors ${
                  category._id === activeCategoryId
                    ? "bg-amber-50 text-amber-700 font-medium"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {category.name}
              </NavLink>
            ))}
          </div>

          <div className="flex-1 p-6 flex gap-10">
            {hasSubmenu ? (
              Object.entries(groups).map(([groupLabel, items]) => (
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
                            to={`/category/${activeCategory.slug}/${item.slug}`}
                            className="text-sm text-slate-600 hover:text-amber-600 transition-colors block"
                          >
                            {item.name}
                          </NavLink>
                        </li>
                      ))}
                  </ul>
                </div>
              ))
            ) : (
              <NavLink
                to={`/category/${activeCategory?.slug}`}
                className="text-sm font-medium text-amber-700 hover:text-amber-800"
              >
                View all {activeCategory?.name} →
              </NavLink>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MegaMenu({ linkClassName }) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

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

  const getGroupedSubcategories = useGroupedSubcategories(subcategories);

  const visibleCategories = categories.slice(0, VISIBLE_COUNT);
  const overflowCategories = categories.slice(VISIBLE_COUNT);

  return (
    <>
      {visibleCategories.map((category) => (
        <CategoryNavItem
          key={category._id}
          category={category}
          groups={getGroupedSubcategories(category._id)}
          linkClassName={linkClassName}
        />
      ))}

      <MoreCategoriesMenu
        categories={overflowCategories}
        getGroupedSubcategories={getGroupedSubcategories}
        linkClassName={linkClassName}
      />
    </>
  );
}

export default MegaMenu;
