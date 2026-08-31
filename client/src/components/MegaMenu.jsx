import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { FaChevronDown } from "react-icons/fa";

import { getCategories } from "../services/categoryService";
import { getSubcategories } from "../services/subcategoryService";
import { useLanguage } from "../context/LanguageContext";

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

// Shared by every dropdown below — hover state is driven by both the
// trigger and the panel itself, since portalling the panel to <body>
// makes it a DOM sibling rather than a descendant of the trigger. Closing
// on a short delay (rather than immediately on mouseleave) is what
// actually makes that work: without it, mouseleave on the trigger
// unmounts the portalled panel in the very next render, before the
// pointer's own mouseenter on the panel ever gets a chance to fire on an
// element that, by then, no longer exists — so it would silently never
// re-open. The delay gives the pointer time to reach the panel and
// cancel the pending close via the same open() call.
const CLOSE_DELAY_MS = 150;

function useHoverDropdown() {
  const triggerRef = useRef(null);
  const closeTimer = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [rect, setRect] = useState(null);

  const open = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
    setIsOpen(true);
  };

  const close = () => {
    closeTimer.current = setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return { triggerRef, isOpen, rect, open, close };
}

// Portalled to <body> — rendered inline, this nav row's own overflow-x
// handling (needed so an overlong row scrolls instead of wrapping mid
// item or silently clipping off-screen items) would otherwise clip any
// absolutely-positioned dropdown, regardless of which element is its
// actual CSS containing block. Positioned via a live getBoundingClientRect
// of the trigger rather than CSS top/left, same fix already used for
// QuickViewModal's own "escape the containing block" problem.
function DropdownPortal({ rect, onMouseEnter, onMouseLeave, children }) {
  if (!rect) return null;

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: rect.bottom,
        left: rect.left,
        zIndex: 50,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function SubmenuPanel({ category, groups }) {
  return (
    <div className="bg-white border border-slate-200 shadow-lg rounded-b-lg p-6 flex gap-10 min-w-max">
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
  const hasSubmenu = Object.keys(groups).length > 0;
  const { triggerRef, isOpen, rect, open, close } = useHoverDropdown();

  return (
    <div
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={hasSubmenu ? open : undefined}
      onMouseLeave={hasSubmenu ? close : undefined}
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

      {isOpen && hasSubmenu && (
        <DropdownPortal rect={rect} onMouseEnter={open} onMouseLeave={close}>
          <SubmenuPanel category={category} groups={groups} />
        </DropdownPortal>
      )}
    </div>
  );
}

function MoreCategoriesMenu({ categories, getGroupedSubcategories, linkClassName }) {
  const { t } = useLanguage();
  const { triggerRef, isOpen, rect, open, close } = useHoverDropdown();
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
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <button
        type="button"
        className={
          linkClassName
            ? `flex items-center gap-1.5 ${linkClassName({ isActive: false })}`
            : "flex items-center gap-1.5 text-sm font-medium px-4 py-3 text-slate-700 hover:text-amber-600"
        }
      >
        {t("More", "और")}
        <FaChevronDown className="text-[10px]" />
      </button>

      {isOpen && (
        <DropdownPortal rect={rect} onMouseEnter={open} onMouseLeave={close}>
          <div className="bg-white border border-slate-200 shadow-lg rounded-b-lg flex min-w-[560px]">
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
                  {t(`View all ${activeCategory?.name} →`, `सभी ${activeCategory?.name} देखें →`)}
                </NavLink>
              )}
            </div>
          </div>
        </DropdownPortal>
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
