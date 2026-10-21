// Predefined chart of accounts, modelled on Tally's own primary groups so
// an accountant (and a later Tally XML export) sees familiar names.
//
// nature: which side a group normally carries -- Asset/Expense are Debit
//         nature, Liability/Income are Credit nature.
// section: which statement the group belongs to --
//         "trading"        -> Trading Account (gross profit)
//         "profit-loss"    -> Profit & Loss Account (net profit)
//         "balance-sheet"  -> Balance Sheet
//
// Sub-groups inherit nature + section from their parent. The seed is
// idempotent (utils/accounting.js ensureAccountingSeed): re-running it
// never overwrites anything an admin has since renamed or changed.

export const VOUCHER_TYPES = {
  Sales: "SAL",
  Purchase: "PUR",
  Payment: "PAY",
  Receipt: "RCT",
  Journal: "JRN",
  Contra: "CNT",
};

export const PRIMARY_GROUPS = [
  { name: "Capital Account", nature: "Liability", section: "balance-sheet" },
  { name: "Current Assets", nature: "Asset", section: "balance-sheet" },
  { name: "Current Liabilities", nature: "Liability", section: "balance-sheet" },
  { name: "Fixed Assets", nature: "Asset", section: "balance-sheet" },
  { name: "Investments", nature: "Asset", section: "balance-sheet" },
  { name: "Loans (Liability)", nature: "Liability", section: "balance-sheet" },
  { name: "Misc. Expenses (ASSET)", nature: "Asset", section: "balance-sheet" },
  { name: "Suspense A/c", nature: "Liability", section: "balance-sheet" },
  { name: "Sales Accounts", nature: "Income", section: "trading" },
  { name: "Purchase Accounts", nature: "Expense", section: "trading" },
  { name: "Direct Incomes", nature: "Income", section: "trading" },
  { name: "Direct Expenses", nature: "Expense", section: "trading" },
  { name: "Indirect Incomes", nature: "Income", section: "profit-loss" },
  { name: "Indirect Expenses", nature: "Expense", section: "profit-loss" },
];

// [name, parent]. `predefined: true` ones are Tally's own sub-groups and
// are locked; the rest are shop-specific conveniences an admin may edit.
export const SUB_GROUPS = [
  { name: "Reserves & Surplus", parent: "Capital Account", predefined: true },
  { name: "Bank Accounts", parent: "Current Assets", predefined: true },
  { name: "Cash-in-Hand", parent: "Current Assets", predefined: true },
  { name: "Deposits (Asset)", parent: "Current Assets", predefined: true },
  { name: "Loans & Advances (Asset)", parent: "Current Assets", predefined: true },
  { name: "Stock-in-Hand", parent: "Current Assets", predefined: true },
  { name: "Sundry Debtors", parent: "Current Assets", predefined: true },
  { name: "Duties & Taxes", parent: "Current Liabilities", predefined: true },
  { name: "Provisions", parent: "Current Liabilities", predefined: true },
  { name: "Sundry Creditors", parent: "Current Liabilities", predefined: true },
  { name: "Secured Loans", parent: "Loans (Liability)", predefined: true },
  { name: "Unsecured Loans", parent: "Loans (Liability)", predefined: true },
  { name: "Software & Subscriptions", parent: "Indirect Expenses" },
  { name: "Domain & Hosting", parent: "Indirect Expenses" },
  { name: "Bank & Gateway Charges", parent: "Indirect Expenses" },
  { name: "Marketing & Advertising", parent: "Indirect Expenses" },
  { name: "Salary & Wages", parent: "Indirect Expenses" },
  { name: "Rent & Utilities", parent: "Indirect Expenses" },
];

// systemKey ledgers are the ones later PRs auto-post to, found by key (so
// an admin renaming one never breaks posting). They cannot be deleted or
// moved to another group; the SBI account is the user's own bank, so it
// is a normal editable ledger.
export const SEED_LEDGERS = [
  { name: "Cash", group: "Cash-in-Hand", systemKey: "cash" },
  { name: "SBI A/C", group: "Bank Accounts", systemKey: "bank-main" },
  { name: "Stock in Hand", group: "Stock-in-Hand", systemKey: "stock" },
  { name: "Razorpay A/c", group: "Sundry Debtors", systemKey: "razorpay" },
  { name: "COD Receivable (Couriers)", group: "Sundry Debtors", systemKey: "cod-receivable" },
  { name: "Proprietor's Capital A/c", group: "Capital Account", systemKey: "capital" },
  { name: "Drawings", group: "Capital Account", systemKey: "drawings" },
  { name: "Sales – Online", group: "Sales Accounts", systemKey: "sales-online" },
  { name: "Sales – POS", group: "Sales Accounts", systemKey: "sales-pos" },
  { name: "Sales Returns", group: "Sales Accounts", systemKey: "sales-returns" },
  { name: "Delivery Charges Recovered", group: "Direct Incomes", systemKey: "delivery-income" },
  { name: "Cost of Goods Sold", group: "Direct Expenses", systemKey: "cogs" },
  { name: "Courier Charges", group: "Direct Expenses", systemKey: "courier" },
  { name: "Packaging Materials", group: "Direct Expenses", systemKey: "packaging" },
  { name: "Discount Allowed", group: "Indirect Expenses", systemKey: "discount" },
  { name: "Stock Written Off", group: "Indirect Expenses", systemKey: "stock-writeoff" },
  { name: "Software Subscriptions", group: "Software & Subscriptions", systemKey: "software" },
  { name: "Domain & Hosting Charges", group: "Domain & Hosting", systemKey: "domain" },
  { name: "Razorpay Charges", group: "Bank & Gateway Charges", systemKey: "gateway-fees" },
  { name: "Marketing & Ads", group: "Marketing & Advertising", systemKey: "marketing" },
  { name: "Salary & Wages", group: "Salary & Wages", systemKey: "salary" },
  { name: "Rent & Utilities", group: "Rent & Utilities", systemKey: "rent" },
  { name: "Other Expenses", group: "Indirect Expenses", systemKey: "other-expense" },
];

// Bump when SEED_LEDGERS/groups gain entries or system keys.
export const SEED_VERSION = 2;

// Expense category (server/config/expenseCategories.js) -> the ledger its
// payment voucher debits.
export const EXPENSE_CATEGORY_LEDGER = {
  "Courier & Shipping": "courier",
  Packaging: "packaging",
  "Software & Subscriptions": "software",
  "Domain & Hosting": "domain",
  "Payment Gateway Fees": "gateway-fees",
  "Marketing & Ads": "marketing",
  "Salary & Wages": "salary",
  "Rent & Utilities": "rent",
  Other: "other-expense",
};

// Books begin on the first day of the financial year the user chose.
export const DEFAULT_BOOKS_START = "2026-04-01";
