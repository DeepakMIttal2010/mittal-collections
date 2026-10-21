import mongoose from "mongoose";

import { EXPENSE_CATEGORIES, PAYMENT_MODES } from "../config/expenseCategories.js";

// One business expense (subscription, domain, packaging, gateway fee...).
// Entries created from a RecurringExpense template carry that template's
// id plus a "YYYY-MM" periodKey; the unique index below is what makes
// "generate this month's entries" safe to run any number of times (page
// opens, concurrent requests) without ever creating a duplicate.
const expenseSchema = new mongoose.Schema(
  {
    // Stored as noon IST of the intended calendar day, so the date never
    // shifts to the previous/next day when read in UTC.
    date: { type: Date, required: true, index: true },

    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },

    amount: { type: Number, required: true, min: 0.01, max: 10000000 },

    vendor: { type: String, default: "", trim: true, maxlength: 100 },

    note: { type: String, default: "", trim: true, maxlength: 300 },

    paymentMode: { type: String, enum: PAYMENT_MODES, default: "Other" },

    recurringTemplate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringExpense",
      default: undefined,
    },

    periodKey: { type: String, default: undefined },

    // Deleting a generated entry only voids it (instead of removing it),
    // otherwise the next "generate due entries" run would simply recreate
    // it. Voided entries are excluded from every list and total.
    voided: { type: Boolean, default: false },
  },
  { timestamps: true },
);

expenseSchema.index(
  { recurringTemplate: 1, periodKey: 1 },
  { unique: true, partialFilterExpression: { recurringTemplate: { $type: "objectId" } } },
);

const Expense = mongoose.model("Expense", expenseSchema);

export default Expense;
