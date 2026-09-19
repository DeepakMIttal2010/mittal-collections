// Canonical list of admin-panel sections that a restricted Role can be
// granted access to. Keep this in sync with server/config/
// adminPermissions.js (same keys) and with this file's own sibling,
// AdminSidebar.jsx's NAV_GROUPS (same "to" paths, keyed by their last
// segment) — there's no shared-code mechanism between client and server
// in this repo, so this list is intentionally duplicated rather than
// imported.
//
// A user with no adminRole (full/unrestricted admin) bypasses this
// list entirely everywhere it's used (AdminSidebar filtering,
// RequirePermission route guard, this file's own PATH_TO_PERMISSION
// map).
export const PERMISSION_GROUPS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", to: "/admin" },
      { key: "reports", label: "Reports", to: "/admin/reports" },
      { key: "walkthrough", label: "Product Walkthrough", to: "/admin/walkthrough" },
    ],
  },
  {
    label: "Catalog & Stock",
    items: [
      { key: "products", label: "Products & Stock", to: "/admin/products" },
      { key: "bulk-import", label: "Bulk Import", to: "/admin/products/bulk-import" },
      { key: "print-labels", label: "Print QR Labels", to: "/admin/print-labels" },
      { key: "categories", label: "Categories", to: "/admin/categories" },
      { key: "subcategories", label: "Sub Categories", to: "/admin/subcategories" },
    ],
  },
  {
    label: "Sales",
    items: [
      { key: "orders", label: "Orders", to: "/admin/orders" },
      { key: "pos", label: "POS Cart", to: "/admin/pos" },
      { key: "coupons", label: "Coupons", to: "/admin/coupons" },
      { key: "returns", label: "Returns", to: "/admin/returns" },
    ],
  },
  {
    label: "Customers",
    items: [
      { key: "customers", label: "Customers", to: "/admin/customers" },
      { key: "rewards-settings", label: "Rewards Settings", to: "/admin/rewards-settings" },
      { key: "testimonials", label: "Testimonials", to: "/admin/testimonials" },
      { key: "reviews", label: "Reviews", to: "/admin/reviews" },
      { key: "questions", label: "Questions", to: "/admin/questions" },
    ],
  },
  {
    label: "Content & Marketing",
    items: [
      { key: "banners", label: "Home Banners", to: "/admin/banners" },
      { key: "trending", label: "Top Trending by Category", to: "/admin/trending" },
      { key: "new-arrivals", label: "New Arrivals by Category", to: "/admin/new-arrivals" },
      { key: "price-ranges", label: "Shop by Price", to: "/admin/price-ranges" },
      { key: "pages", label: "Site Content", to: "/admin/pages" },
      { key: "articles", label: "Articles", to: "/admin/articles" },
      { key: "footer-links", label: "Footer Links", to: "/admin/footer-links" },
      { key: "newsletter", label: "Newsletter", to: "/admin/newsletter" },
    ],
  },
  {
    label: "Support",
    items: [
      { key: "messages", label: "Messages", to: "/admin/messages" },
      { key: "tickets", label: "Support Tickets", to: "/admin/tickets" },
    ],
  },
  {
    label: "Team & Access",
    items: [
      { key: "staff-users", label: "Staff Users", to: "/admin/staff-users" },
      { key: "roles", label: "Roles & Permissions", to: "/admin/roles" },
    ],
  },
  {
    label: "Configuration",
    items: [{ key: "settings", label: "Settings", to: "/admin/settings" }],
  },
];

export const PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key),
);

// Longest-"to"-first so a nested path (e.g. /admin/products/bulk-import)
// matches its own entry rather than the shorter /admin/products prefix.
const PATH_ENTRIES = PERMISSION_GROUPS.flatMap((group) => group.items).sort(
  (a, b) => b.to.length - a.to.length,
);

export function permissionForPath(pathname) {
  const entry = PATH_ENTRIES.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  return entry?.key ?? null;
}

// A second, smaller, additive right on top of the View-only permission
// model above — only for the handful of high-traffic CRUD sections
// where an owner wants to let someone see the list without being able
// to create/edit/delete. Keep in sync with server/config/
// adminPermissions.js's GRANULAR_MODULES.
export const GRANULAR_MODULES = [
  { key: "products", label: "Products & Stock", actions: ["new", "modified"] },
  { key: "categories", label: "Categories", actions: ["new", "modified"] },
  { key: "subcategories", label: "Sub Categories", actions: ["new", "modified"] },
  { key: "coupons", label: "Coupons", actions: ["new", "modified"] },
  { key: "orders", label: "Orders", actions: ["modified"] },
];

// true for a full/unrestricted admin (no adminRole) or a restricted
// account whose role's writeAccess includes "<key>:<action>".
export function hasWriteAccess(user, key, action) {
  if (!user?.adminRole) return true;
  return !!user.adminRole.writeAccess?.includes(`${key}:${action}`);
}

// Route-guard entries for the sub-routes that need a write action, not
// just view access — only Products and Categories have real separate
// add/edit routes (Sub Categories/Coupons/Orders use an inline
// list+form on one page, so they only need their buttons hidden, not a
// route guarded). Longest-path-first, same reasoning as PATH_ENTRIES.
const WRITE_ACTION_PATHS = [
  { to: "/admin/products/add", key: "products", action: "new" },
  { to: "/admin/products/edit", key: "products", action: "modified" },
  { to: "/admin/categories/add", key: "categories", action: "new" },
  { to: "/admin/categories/edit", key: "categories", action: "modified" },
].sort((a, b) => b.to.length - a.to.length);

export function writeAccessForPath(pathname) {
  return WRITE_ACTION_PATHS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}
