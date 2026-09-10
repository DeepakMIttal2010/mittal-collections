// Canonical list of admin-panel sections that a restricted Role can be
// granted access to. Keep this in sync with client/src/config/
// adminPermissions.js (same keys) and with client/src/components/admin/
// AdminSidebar.jsx's NAV_GROUPS (same "to" paths, keyed by their last
// segment) — there's no shared-code mechanism between client and server
// in this repo, so this list is intentionally duplicated rather than
// imported.
//
// A user with no Role assigned (`adminRole: null`) is a full/unrestricted
// admin and bypasses this list entirely — see requirePermission.js.
export const PERMISSION_GROUPS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard" },
      { key: "reports", label: "Reports" },
      { key: "walkthrough", label: "Product Walkthrough" },
    ],
  },
  {
    label: "Catalog & Stock",
    items: [
      { key: "products", label: "Products & Stock" },
      { key: "bulk-import", label: "Bulk Import" },
      { key: "print-labels", label: "Print QR Labels" },
      { key: "categories", label: "Categories" },
      { key: "subcategories", label: "Sub Categories" },
    ],
  },
  {
    label: "Sales",
    items: [
      { key: "orders", label: "Orders" },
      { key: "pos", label: "POS Cart" },
      { key: "coupons", label: "Coupons" },
      { key: "returns", label: "Returns" },
    ],
  },
  {
    label: "Customers",
    items: [
      { key: "customers", label: "Customers" },
      { key: "rewards-settings", label: "Rewards Settings" },
      { key: "testimonials", label: "Testimonials" },
      { key: "reviews", label: "Reviews" },
      { key: "questions", label: "Questions" },
    ],
  },
  {
    label: "Content & Marketing",
    items: [
      { key: "banners", label: "Home Banners" },
      { key: "trending", label: "Top Trending by Category" },
      { key: "new-arrivals", label: "New Arrivals by Category" },
      { key: "price-ranges", label: "Shop by Price" },
      { key: "pages", label: "Site Content" },
      { key: "articles", label: "Articles" },
      { key: "footer-links", label: "Footer Links" },
      { key: "newsletter", label: "Newsletter" },
    ],
  },
  {
    label: "Support",
    items: [
      { key: "messages", label: "Messages" },
      { key: "tickets", label: "Support Tickets" },
    ],
  },
  {
    label: "Team & Access",
    items: [
      { key: "staff-users", label: "Staff Users" },
      { key: "roles", label: "Roles & Permissions" },
    ],
  },
  {
    label: "Configuration",
    items: [{ key: "settings", label: "Settings" }],
  },
];

export const PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key),
);

// A second, smaller, additive right on top of the View-only permission
// model above — only for the handful of high-traffic sections where an
// owner wants to let someone see the list without being able to
// create/edit/delete. Entries in Role.writeAccess are shaped
// "<key>:<action>" (e.g. "products:new"), same flat-array + .includes()
// shape the `permissions` field already uses. Delete is intentionally
// folded into "modified" — this models exactly the three rights asked
// for (View / New / Modified), not four.
export const GRANULAR_MODULES = [
  { key: "products", label: "Products & Stock", actions: ["new", "modified"] },
  { key: "categories", label: "Categories", actions: ["new", "modified"] },
  { key: "subcategories", label: "Sub Categories", actions: ["new", "modified"] },
  { key: "coupons", label: "Coupons", actions: ["new", "modified"] },
  // No "new" here — there's no admin-created-order concept on this
  // page, just status updates on orders customers placed.
  { key: "orders", label: "Orders", actions: ["modified"] },
];
