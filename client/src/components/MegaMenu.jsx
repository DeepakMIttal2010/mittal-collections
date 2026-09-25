import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { FaChevronDown } from "react-icons/fa";

import { getCategories } from "../services/categoryService";
import { getSubcategories } from "../services/subcategoryService";
import { useLanguage } from "../context/LanguageContext";

// How many categories show as their own top-level nav link (in the
// priority order the categories API already returns — product count
// by default, pinned categories first) before the rest collapse into a
// "More" dropdown. 5 plus the fixed Home/Top Trending/Clearance
// Sale/New Arrivals/Guides links overflowed a common 1366px laptop
// width once the visible 5 became longer names (Table Covers, Cushion
// Covers, Table Runners) than whatever short ones used to be there —
// the row's own overflow-x-auto (see Navbar.jsx) caught it rather than
// clipping anything, but needing to scroll the main nav at all on a
// perfectly normal width is exactly what this cap exists to avoid.
const VISIBLE_COUNT = 4;

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
  const panelRef = useRef(null);
  const [left, setLeft] = useState(rect ? rect.left : 0);

  // Clamps the panel's left offset so it never spills past the right edge
  // of the viewport (it otherwise always opened flush with the trigger's
  // left edge, which pushed wider panels — e.g. 3+ subcategory groups —
  // off-screen). Runs before paint, so there's no visible jump.
  useLayoutEffect(() => {
    if (!rect || !panelRef.current) return;
    const margin = 12;
    const panelWidth = panelRef.current.offsetWidth;
    const maxLeft = window.innerWidth - panelWidth - margin;
    setLeft(Math.max(margin, Math.min(rect.left, maxLeft)));
  }, [rect]);

  if (!rect) return null;

  return createPortal(
    <div
      ref={panelRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: rect.bottom,
        left,
        zIndex: 50,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// Shared by SubmenuPanel and MoreCategoriesMenu's own panel — a single
// place to style a group of subcategory links so the two dropdowns never
// drift into two different looks again (they used to duplicate this
// markup verbatim). The amber accent bar + tinted hover pill replace the
// previous plain grey-text-on-white treatment, which read as flat/dead
// against the rest of the site's warm amber/orange branding.
function SubmenuGroups({ groups, hrefFor }) {
  const { t } = useLanguage();

  return Object.entries(groups).map(([groupLabel, items]) => (
    <div key={groupLabel} className="min-w-[140px] shrink-0">
      <h4 className="text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-2 pb-1.5 border-b-2 border-amber-200 whitespace-nowrap">
        {groupLabel}
      </h4>

      <ul className="space-y-0.5">
        {items
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((item) => (
            <li key={item._id}>
              <NavLink
                to={hrefFor(item)}
                className="text-sm text-slate-600 hover:text-amber-700 hover:bg-amber-50 transition-colors block -mx-2 px-2 py-1.5 rounded-md whitespace-nowrap"
              >
                {t(item.name, item.nameHi)}
              </NavLink>
            </li>
          ))}
      </ul>
    </div>
  ));
}

function SubmenuPanel({ category, groups }) {
  return (
    <div className="bg-white border border-slate-200 border-t-4 border-t-amber-500 shadow-xl rounded-b-xl p-5 flex gap-7 max-w-[90vw] overflow-x-auto">
      <SubmenuGroups
        groups={groups}
        hrefFor={(item) => `/category/${category.slug}/${item.slug}`}
      />
    </div>
  );
}

function CategoryNavItem({ category, groups, linkClassName }) {
  const { t } = useLanguage();
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
        {t(category.name, category.nameHi)}
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
          <div className="bg-white border border-slate-200 border-t-4 border-t-amber-500 shadow-xl rounded-b-xl flex max-w-[90vw]">
            <div className="w-44 border-r border-slate-100 py-2 shrink-0">
              {categories.map((category) => (
                <NavLink
                  key={category._id}
                  to={`/category/${category.slug}`}
                  onMouseEnter={() => setActiveCategoryId(category._id)}
                  className={`block mx-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                    category._id === activeCategoryId
                      ? "bg-amber-100 text-amber-800 font-semibold"
                      : "text-slate-700 hover:bg-amber-50 hover:text-amber-700"
                  }`}
                >
                  {t(category.name, category.nameHi)}
                </NavLink>
              ))}
            </div>

            <div className="flex-1 p-5 flex gap-7 overflow-x-auto">
              {hasSubmenu ? (
                <SubmenuGroups
                  groups={groups}
                  hrefFor={(item) => `/category/${activeCategory.slug}/${item.slug}`}
                />
              ) : (
                <NavLink
                  to={`/category/${activeCategory?.slug}`}
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  {t(
                    `View all ${activeCategory?.name} →`,
                    `सभी ${t(activeCategory?.name, activeCategory?.nameHi)} देखें →`,
                  )}
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
