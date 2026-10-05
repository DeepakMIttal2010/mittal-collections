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

// Moves focus to the next/previous focusable link or button inside
// `container` relative to whichever one is currently focused, wrapping
// at either end. Used by the submenu panels' own ArrowDown/ArrowUp
// handling — see the comment on DropdownPortal for why this exists
// instead of relying on Tab to wander into/through a portalled panel.
function focusAdjacent(container, direction) {
  if (!container) return;
  const focusables = [...container.querySelectorAll("a, button")];
  if (focusables.length === 0) return;
  const currentIndex = focusables.indexOf(document.activeElement);
  const nextIndex =
    currentIndex === -1
      ? 0
      : (currentIndex + direction + focusables.length) % focusables.length;
  focusables[nextIndex].focus();
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

// Portalled to `target` (a node Navbar.jsx places as a sibling right
// after <nav>, falling back to document.body before that ref is ready)
// — rendered inline, this nav row's own overflow-x handling (needed so
// an overlong row scrolls instead of wrapping mid item or silently
// clipping off-screen items) would otherwise clip any absolutely-
// positioned dropdown, regardless of which element is its actual CSS
// containing block. Positioned via a live getBoundingClientRect of the
// trigger rather than CSS top/left, same fix already used for
// QuickViewModal's own "escape the containing block" problem.
//
// `target` (a node Navbar.jsx places right after <nav>) replaces the
// previous document.body target as of a 2026-10-05 a11y pass, but that
// alone does NOT fix keyboard reachability the way an earlier version of
// this comment assumed: every top-level trigger lives inside the same
// <nav>, so Tab from an early trigger (e.g. Bedsheets) still reaches every
// LATER trigger (Comforters, Curtains, ...) before it could ever reach
// anything positioned after the whole nav — confirmed live with a
// Playwright keyboard-only pass, not just reasoned about. Real fix is
// ArrowDown/ArrowUp navigation driven by CategoryNavItem/MoreCategoriesMenu
// (see their onKeyDown handlers) using `panelRef` below to move focus
// programmatically into and within the open panel, rather than relying on
// sequential Tab to wander in on its own — the standard pattern for
// disclosure/menu widgets (W3C ARIA Authoring Practices), not specific to
// this codebase. onFocus/onBlur ARE still wired on the trigger (not
// re-copied here) purely to make the panel visually appear/disappear as
// focus arrives/leaves — React bubbles focus/blur along the component
// tree even across a portal boundary, so those trigger-level handlers see
// focus events from inside the portalled panel too.
function DropdownPortal({ rect, target, panelRef: externalPanelRef, onMouseEnter, onMouseLeave, onKeyDown, children }) {
  const panelRef = useRef(null);
  const [left, setLeft] = useState(rect ? rect.left : 0);
  // Tracks the narrowest `left` computed so far for the CURRENT open
  // session (keyed to `rect`'s identity, which only changes when the
  // dropdown is freshly re-opened via open() — see minLeftRef.rect
  // below). Never reset by a mere width change within the same session.
  const minLeftRef = useRef({ rect: null, value: null });

  // Clamps the panel's left offset so it never spills past the right edge
  // of the viewport (it otherwise always opened flush with the trigger's
  // left edge, which pushed wider panels — e.g. 3+ subcategory groups —
  // off-screen). Runs before paint, so there's no visible jump.
  //
  // Also depends on `children`, not just `rect` — MoreCategoriesMenu swaps
  // which category's (differently-wide) subcategory groups render here
  // purely via internal hover (setActiveCategoryId on a row inside this
  // already-open panel), which never re-fires the trigger's onMouseEnter
  // and so never recomputes `rect`. Without this, the panel's left offset
  // stayed pinned to whatever the FIRST hovered category needed, so
  // switching from a narrower category (e.g. Dohars, 3 groups) to a wider
  // one (e.g. Comforters, 4 groups) left the last column clipped off the
  // right edge of the screen instead of the panel re-centering itself.
  //
  // Only ever moves `left` FURTHER left (smaller value), never back right,
  // for as long as `rect` stays the same open session. Moving right when
  // switching to a narrower category (e.g. Mattress Covers -> Table
  // Covers) slid the whole panel out from under a stationary mouse,
  // firing a real `mouseleave` on the portal div and snapping the entire
  // "More" menu shut mid-browse — a real regression this same re-centering
  // fix introduced. Only ever shrinking leftward means the panel can end
  // up wider than the current content strictly needs, but it never moves
  // out from under the cursor while already open.
  useLayoutEffect(() => {
    if (!rect || !panelRef.current) return;
    const margin = 12;
    const panelWidth = panelRef.current.offsetWidth;
    const maxLeft = window.innerWidth - panelWidth - margin;
    const desiredLeft = Math.max(margin, Math.min(rect.left, maxLeft));

    if (minLeftRef.current.rect !== rect) {
      minLeftRef.current = { rect, value: desiredLeft };
      setLeft(desiredLeft);
    } else if (desiredLeft < minLeftRef.current.value) {
      minLeftRef.current.value = desiredLeft;
      setLeft(desiredLeft);
    }
  }, [rect, children]);

  if (!rect) return null;

  return createPortal(
    <div
      ref={(el) => {
        panelRef.current = el;
        if (externalPanelRef) externalPanelRef.current = el;
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        top: rect.bottom,
        left,
        zIndex: 50,
      }}
    >
      {children}
    </div>,
    target || document.body,
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

function CategoryNavItem({ category, groups, linkClassName, portalTarget }) {
  const { t } = useLanguage();
  const triggerLinkRef = useRef(null);
  const panelRef = useRef(null);
  const hasSubmenu = Object.keys(groups).length > 0;
  const { triggerRef, isOpen, rect, open, close } = useHoverDropdown();

  const closeAndReturnFocus = () => {
    close();
    triggerLinkRef.current?.focus();
  };

  return (
    <div
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={hasSubmenu ? open : undefined}
      onMouseLeave={hasSubmenu ? close : undefined}
      onFocus={hasSubmenu ? open : undefined}
      onBlur={hasSubmenu ? close : undefined}
      onKeyDown={
        hasSubmenu
          ? (e) => {
              if (e.key === "Escape") {
                closeAndReturnFocus();
              } else if (e.key === "ArrowDown" && document.activeElement === triggerLinkRef.current) {
                // Tab can't reliably reach a portalled panel's own links
                // (see DropdownPortal's comment) — ArrowDown moves focus
                // into it directly instead, the standard pattern for
                // disclosure menus. Only handled when focus is still ON
                // the trigger itself, so it doesn't fight the panel's own
                // ArrowDown handling once focus has moved inside.
                e.preventDefault();
                open();
                requestAnimationFrame(() => focusAdjacent(panelRef.current, 1));
              }
            }
          : undefined
      }
    >
      <NavLink
        ref={triggerLinkRef}
        to={`/category/${category.slug}`}
        aria-haspopup={hasSubmenu ? "true" : undefined}
        aria-expanded={hasSubmenu ? isOpen : undefined}
        className={
          linkClassName ||
          "text-sm font-medium px-4 py-3 text-slate-700 hover:text-amber-600"
        }
      >
        {t(category.name, category.nameHi)}
      </NavLink>

      {isOpen && hasSubmenu && (
        <DropdownPortal
          rect={rect}
          target={portalTarget}
          panelRef={panelRef}
          onMouseEnter={open}
          onMouseLeave={close}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              closeAndReturnFocus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              focusAdjacent(panelRef.current, 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusAdjacent(panelRef.current, -1);
            }
          }}
        >
          <SubmenuPanel category={category} groups={groups} />
        </DropdownPortal>
      )}
    </div>
  );
}

function MoreCategoriesMenu({ categories, getGroupedSubcategories, linkClassName, portalTarget }) {
  const { t } = useLanguage();
  const triggerButtonRef = useRef(null);
  const panelRef = useRef(null);
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

  const closeAndReturnFocus = () => {
    close();
    triggerButtonRef.current?.focus();
  };

  return (
    <div
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          closeAndReturnFocus();
        } else if (e.key === "ArrowDown" && document.activeElement === triggerButtonRef.current) {
          // Same reasoning as CategoryNavItem's own ArrowDown handler —
          // see DropdownPortal's comment on why Tab alone can't reach a
          // portalled panel's links.
          e.preventDefault();
          open();
          requestAnimationFrame(() => focusAdjacent(panelRef.current, 1));
        }
      }}
    >
      <button
        type="button"
        ref={triggerButtonRef}
        aria-haspopup="true"
        aria-expanded={isOpen}
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
        <DropdownPortal
          rect={rect}
          target={portalTarget}
          panelRef={panelRef}
          onMouseEnter={open}
          onMouseLeave={close}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              closeAndReturnFocus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              focusAdjacent(panelRef.current, 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusAdjacent(panelRef.current, -1);
            }
          }}
        >
          <div className="bg-white border border-slate-200 border-t-4 border-t-amber-500 shadow-xl rounded-b-xl flex max-w-[90vw]">
            <div className="w-44 border-r border-slate-100 py-2 shrink-0">
              {categories.map((category) => (
                <NavLink
                  key={category._id}
                  to={`/category/${category.slug}`}
                  onMouseEnter={() => setActiveCategoryId(category._id)}
                  onFocus={() => setActiveCategoryId(category._id)}
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

function MegaMenu({ linkClassName, portalTarget }) {
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
          portalTarget={portalTarget}
        />
      ))}

      <MoreCategoriesMenu
        categories={overflowCategories}
        getGroupedSubcategories={getGroupedSubcategories}
        linkClassName={linkClassName}
        portalTarget={portalTarget}
      />
    </>
  );
}

export default MegaMenu;
