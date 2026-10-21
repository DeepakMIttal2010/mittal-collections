// Canonical list of business-expense categories. Keep in sync with
// client/src/config/expenseCategories.js (same strings) -- there's no
// shared-code mechanism between client and server in this repo, so the
// list is intentionally duplicated rather than imported.
//
// Order-level costs (product purchase price, misc expenses, courier
// charge) live on OrderCost, not here; this ledger is for everything
// else the business pays for.
export const EXPENSE_CATEGORIES = [
  "Courier & Shipping",
  "Packaging",
  "Software & Subscriptions",
  "Domain & Hosting",
  "Payment Gateway Fees",
  "Marketing & Ads",
  "Salary & Wages",
  "Rent & Utilities",
  "Other",
];

export const PAYMENT_MODES = ["UPI", "Bank Transfer", "Card", "Cash", "Other"];
