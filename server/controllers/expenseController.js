import Expense from "../models/Expense.js";
import { syncExpense, syncAllExpenses, postSafely } from "../utils/accountingPosting.js";
import RecurringExpense from "../models/RecurringExpense.js";
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from "../config/expenseCategories.js";
import { generateDueRecurringExpenses, parseIstDate, round2 } from "../utils/recurringExpenses.js";

const LIST_LIMIT = 2000;
const MIN_YEAR_DATE = new Date("2020-01-01T00:00:00+05:30");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const isText = (v, max) => typeof v === "string" && v.length <= max;

// Shared by expenses and recurring templates. Returns { error } or { value }
// where value only ever contains validated, typed fields -- nothing from
// req.body reaches a query or a document unchecked.
const validateCommon = (body, { partial = false } = {}) => {
  const value = {};

  if (!partial || body.category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(body.category)) return { error: "Choose a valid category." };
    value.category = body.category;
  }

  if (!partial || body.amount !== undefined) {
    const amount = body.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0.01 || amount > 10000000) {
      return { error: "Amount must be a number between 0.01 and 10,000,000." };
    }
    value.amount = round2(amount);
  }

  if (body.vendor !== undefined) {
    if (!isText(body.vendor, 100)) return { error: "Vendor must be text up to 100 characters." };
    value.vendor = body.vendor.trim();
  }

  if (body.note !== undefined) {
    if (!isText(body.note, 300)) return { error: "Note must be text up to 300 characters." };
    value.note = body.note.trim();
  }

  if (body.paymentMode !== undefined) {
    if (!PAYMENT_MODES.includes(body.paymentMode)) return { error: "Choose a valid payment mode." };
    value.paymentMode = body.paymentMode;
  }

  return { value };
};

const validateDate = (raw, label) => {
  const date = parseIstDate(raw);
  if (!date) return { error: `${label} must be a real date in YYYY-MM-DD format.` };
  if (date < MIN_YEAR_DATE) return { error: `${label} cannot be before 2020.` };
  return { value: date };
};

// ============================
// List expenses (+ totals)
// ============================
export const getExpenses = async (req, res) => {
  try {
    const { from, to, category } = req.query;
    const filter = { voided: false };

    if (from !== undefined || to !== undefined) {
      filter.date = {};
      if (from !== undefined) {
        const f = validateDate(from, "From");
        if (f.error) return fail(res, 400, f.error);
        filter.date.$gte = f.value;
      }
      if (to !== undefined) {
        const t = validateDate(to, "To");
        if (t.error) return fail(res, 400, t.error);
        // Noon IST of the "to" day -> include that whole day.
        filter.date.$lte = new Date(t.value.getTime() + 12 * 60 * 60 * 1000 - 1);
      }
    }

    if (category !== undefined) {
      if (!EXPENSE_CATEGORIES.includes(category)) return fail(res, 400, "Unknown category.");
      filter.category = category;
    }

    // Opening the ledger is what materialises due subscription entries.
    if ((await generateDueRecurringExpenses()) > 0) await postSafely(syncAllExpenses);

    const [expenses, byCategory] = await Promise.all([
      Expense.find(filter).sort({ date: -1, _id: -1 }).limit(LIST_LIMIT).lean(),
      Expense.aggregate([
        { $match: filter },
        { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      expenses,
      totals: {
        total: round2(byCategory.reduce((sum, c) => sum + c.total, 0)),
        byCategory: byCategory.map((c) => ({ category: c._id, total: round2(c.total), count: c.count })),
      },
    });
  } catch (error) {
    console.error("Get Expenses Error:", error);
    fail(res, 500, "Server Error");
  }
};

// ============================
// Create / update / delete one expense
// ============================
export const createExpense = async (req, res) => {
  try {
    const common = validateCommon(req.body);
    if (common.error) return fail(res, 400, common.error);

    const date = validateDate(req.body.date, "Date");
    if (date.error) return fail(res, 400, date.error);

    const expense = await Expense.create({ ...common.value, date: date.value });
    await postSafely(syncExpense, expense._id);

    res.status(201).json({ success: true, expense });
  } catch (error) {
    console.error("Create Expense Error:", error);
    fail(res, 500, "Server Error");
  }
};

export const updateExpense = async (req, res) => {
  try {
    const common = validateCommon(req.body, { partial: true });
    if (common.error) return fail(res, 400, common.error);

    const update = { ...common.value };

    if (req.body.date !== undefined) {
      const date = validateDate(req.body.date, "Date");
      if (date.error) return fail(res, 400, date.error);
      update.date = date.value;
    }

    if (Object.keys(update).length === 0) return fail(res, 400, "Nothing to update.");

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, voided: false },
      { $set: update },
      { returnDocument: "after", runValidators: true },
    );

    if (!expense) return fail(res, 404, "Expense not found");
    await postSafely(syncExpense, expense._id);

    res.status(200).json({ success: true, expense });
  } catch (error) {
    console.error("Update Expense Error:", error);
    fail(res, 500, "Server Error");
  }
};

// A hand-entered expense is deleted outright. One generated from a
// recurring template is only voided, otherwise the next generation run
// would recreate it.
export const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.id, voided: false }).select("recurringTemplate");

    if (!expense) return fail(res, 404, "Expense not found");

    if (expense.recurringTemplate) {
      await Expense.updateOne({ _id: expense._id }, { $set: { voided: true } });
    } else {
      await Expense.deleteOne({ _id: expense._id });
    }
    await postSafely(syncExpense, expense._id);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete Expense Error:", error);
    fail(res, 500, "Server Error");
  }
};

// ============================
// Recurring templates
// ============================
export const getRecurringExpenses = async (req, res) => {
  try {
    const templates = await RecurringExpense.find().sort({ isActive: -1, createdAt: 1 }).lean();
    res.status(200).json({ success: true, templates });
  } catch (error) {
    console.error("Get Recurring Expenses Error:", error);
    fail(res, 500, "Server Error");
  }
};

const validateTemplate = (body, { partial = false } = {}) => {
  const common = validateCommon(body, { partial });
  if (common.error) return common;
  const value = common.value;

  if (!partial || body.name !== undefined) {
    if (!isText(body.name, 100) || !body.name.trim()) return { error: "Name is required (up to 100 characters)." };
    value.name = body.name.trim();
  }

  if (body.billing !== undefined) {
    if (!["monthly", "yearly-spread"].includes(body.billing)) return { error: "Billing must be monthly or yearly-spread." };
    value.billing = body.billing;
  }

  if (!partial || body.startDate !== undefined) {
    const start = validateDate(body.startDate, "Start date");
    if (start.error) return start;
    // Bounds the month-by-month generation loop (a typo like year 2099
    // would otherwise never generate, and 2020 at most ~80 entries).
    if (start.value > new Date(Date.now() + 366 * 24 * 60 * 60 * 1000)) {
      return { error: "Start date cannot be more than a year in the future." };
    }
    value.startDate = start.value;
  }

  if (body.endDate !== undefined) {
    if (body.endDate === null) {
      value.endDate = null;
    } else {
      const end = validateDate(body.endDate, "End date");
      if (end.error) return end;
      value.endDate = end.value;
    }
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") return { error: "isActive must be true or false." };
    value.isActive = body.isActive;
  }

  return { value };
};

export const createRecurringExpense = async (req, res) => {
  try {
    const parsed = validateTemplate(req.body);
    if (parsed.error) return fail(res, 400, parsed.error);

    const template = await RecurringExpense.create(parsed.value);

    // Backfill immediately so e.g. "Claude from 28 Jul" shows its past
    // months right away instead of at the next ledger open.
    if ((await generateDueRecurringExpenses()) > 0) await postSafely(syncAllExpenses);

    res.status(201).json({ success: true, template });
  } catch (error) {
    console.error("Create Recurring Expense Error:", error);
    fail(res, 500, "Server Error");
  }
};

export const updateRecurringExpense = async (req, res) => {
  try {
    const parsed = validateTemplate(req.body, { partial: true });
    if (parsed.error) return fail(res, 400, parsed.error);

    if (Object.keys(parsed.value).length === 0) return fail(res, 400, "Nothing to update.");

    const template = await RecurringExpense.findByIdAndUpdate(
      req.params.id,
      { $set: parsed.value },
      { returnDocument: "after", runValidators: true },
    );

    if (!template) return fail(res, 404, "Recurring expense not found");

    res.status(200).json({ success: true, template });
  } catch (error) {
    console.error("Update Recurring Expense Error:", error);
    fail(res, 500, "Server Error");
  }
};

// Stops future entries; entries already generated stay in the ledger.
export const deactivateRecurringExpense = async (req, res) => {
  try {
    const template = await RecurringExpense.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { returnDocument: "after" },
    );

    if (!template) return fail(res, 404, "Recurring expense not found");

    res.status(200).json({ success: true, template });
  } catch (error) {
    console.error("Deactivate Recurring Expense Error:", error);
    fail(res, 500, "Server Error");
  }
};
