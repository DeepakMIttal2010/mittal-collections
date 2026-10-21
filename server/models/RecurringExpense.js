import mongoose from "mongoose";

import { EXPENSE_CATEGORIES, PAYMENT_MODES } from "../config/expenseCategories.js";

// A subscription-style cost that repeats. Entries are turned into real
// Expense documents by utils/recurringExpenses.js (on demand, when the
// ledger is opened) -- one per calendar month from startDate up to the
// current month, never future-dated.
//
// billing:
//   "monthly"       -> `amount` is charged every month (Claude, ChatGPT).
//   "yearly-spread" -> `amount` is the YEARLY price; each month gets
//                      amount / 12 so one annual bill (a domain) doesn't
//                      make a single month look unprofitable.
//
// Editing a template only affects months that have not been generated
// yet; entries already generated stay as they are (edit those directly,
// e.g. when an approximate subscription amount turns out different).
const recurringExpenseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },

    amount: { type: Number, required: true, min: 0.01, max: 10000000 },

    billing: { type: String, enum: ["monthly", "yearly-spread"], default: "monthly" },

    // Noon IST of the first charge date; its day-of-month is reused every
    // month (clamped to the month's last day, e.g. the 31st in February).
    startDate: { type: Date, required: true },

    endDate: { type: Date, default: null },

    vendor: { type: String, default: "", trim: true, maxlength: 100 },

    note: { type: String, default: "", trim: true, maxlength: 300 },

    paymentMode: { type: String, enum: PAYMENT_MODES, default: "Other" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const RecurringExpense = mongoose.model("RecurringExpense", recurringExpenseSchema);

export default RecurringExpense;
