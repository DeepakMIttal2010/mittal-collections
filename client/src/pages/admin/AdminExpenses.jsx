import { useCallback, useEffect, useRef, useState } from "react";

import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  stopRecurringExpense,
} from "../../services/adminExpenseService";
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from "../../config/expenseCategories";

const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const toDateString = (value) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const displayDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// First and last calendar day of a "YYYY-MM" month.
const monthRange = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
};

// Spreadsheet apps run a cell starting with = + - @ as a formula; a vendor
// or note typed that way would execute when the CSV is opened.
const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const emptyExpense = () => ({
  date: istToday(),
  category: EXPENSE_CATEGORIES[0],
  amount: "",
  vendor: "",
  note: "",
  paymentMode: "UPI",
});

const emptyTemplate = () => ({
  name: "",
  category: "Software & Subscriptions",
  amount: "",
  billing: "monthly",
  startDate: istToday(),
  vendor: "",
  paymentMode: "Card",
});

const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm";

function Field({ label, children }) {
  return (
    <label className="block text-sm text-slate-600">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

function AdminExpenses() {
  const [period, setPeriod] = useState(istToday().slice(0, 7)); // "YYYY-MM" | "all"
  const [category, setCategory] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [totals, setTotals] = useState({ total: 0, byCategory: [] });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState(null); // expense being added/edited
  const [editingId, setEditingId] = useState(null);
  const [templateForm, setTemplateForm] = useState(null);
  const [templateEditingId, setTemplateEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Only the latest request may update the page (see VouchersTab).
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);

    const range = period === "all" ? {} : monthRange(period);
    const [list, recurring] = await Promise.all([
      getExpenses({ ...range, category }),
      getRecurringExpenses(),
    ]);

    if (requestId !== latestRequest.current) return;

    if (list.success) {
      setExpenses(list.expenses);
      setTotals(list.totals);
    } else {
      setMessage(list.message || "Could not load expenses.");
    }

    if (recurring.success) setTemplates(recurring.templates);

    setLoading(false);
  }, [period, category]);

  useEffect(() => {
    load();
  }, [load]);

  const parseAmount = (raw) => {
    const amount = Number(String(raw).trim());
    return String(raw).trim() !== "" && Number.isFinite(amount) ? amount : null;
  };

  const saveExpense = async () => {
    const amount = parseAmount(form.amount);
    if (amount === null || amount <= 0) {
      setMessage("Enter a valid amount greater than 0.");
      return;
    }

    setSaving(true);
    setMessage("");

    const body = { ...form, amount };
    const res = editingId ? await updateExpense(editingId, body) : await createExpense(body);

    setSaving(false);

    if (!res.success) {
      setMessage(res.message || "Could not save the expense.");
      return;
    }

    setForm(null);
    setEditingId(null);
    setMessage(editingId ? "Expense updated." : "Expense added.");
    load();
  };

  const removeExpense = async (expense) => {
    const what = expense.recurringTemplate
      ? "This is an automatic subscription entry; it will be removed from the ledger and not created again."
      : "Delete this expense?";
    if (!window.confirm(`${what}\n\n${expense.category} - ${rupees(expense.amount)} (${displayDate(expense.date)})`)) {
      return;
    }

    const res = await deleteExpense(expense._id);
    setMessage(res.success ? "Expense removed." : res.message || "Could not delete.");
    if (res.success) load();
  };

  const saveTemplate = async () => {
    const amount = parseAmount(templateForm.amount);
    if (!templateForm.name.trim()) {
      setMessage("Give the recurring expense a name.");
      return;
    }
    if (amount === null || amount <= 0) {
      setMessage("Enter a valid amount greater than 0.");
      return;
    }

    setSaving(true);
    setMessage("");

    const body = { ...templateForm, amount };
    const res = templateEditingId
      ? await updateRecurringExpense(templateEditingId, body)
      : await createRecurringExpense(body);

    setSaving(false);

    if (!res.success) {
      setMessage(res.message || "Could not save the recurring expense.");
      return;
    }

    setTemplateForm(null);
    setTemplateEditingId(null);
    setMessage(
      templateEditingId
        ? "Saved. Entries already in the ledger are unchanged; only future months use the new values."
        : "Recurring expense added and its past months were filled in.",
    );
    load();
  };

  const stopTemplate = async (template) => {
    if (!window.confirm(`Stop "${template.name}"? Existing entries stay; no new ones will be created.`)) return;

    const res = await stopRecurringExpense(template._id);
    setMessage(res.success ? "Stopped." : res.message || "Could not stop it.");
    if (res.success) load();
  };

  const startEditExpense = (expense) => {
    setEditingId(expense._id);
    setForm({
      date: toDateString(expense.date),
      category: expense.category,
      amount: String(expense.amount),
      vendor: expense.vendor || "",
      note: expense.note || "",
      paymentMode: expense.paymentMode || "Other",
    });
  };

  const startEditTemplate = (template) => {
    setTemplateEditingId(template._id);
    setTemplateForm({
      name: template.name,
      category: template.category,
      amount: String(template.amount),
      billing: template.billing,
      startDate: toDateString(template.startDate),
      vendor: template.vendor || "",
      paymentMode: template.paymentMode || "Other",
    });
  };

  const exportCsv = () => {
    const rows = [
      ["Date", "Category", "Vendor", "Note", "Amount", "Payment mode", "Recurring"],
      ...expenses.map((e) => [
        toDateString(e.date),
        e.category,
        e.vendor,
        e.note,
        e.amount,
        e.paymentMode,
        e.recurringTemplate ? "Yes" : "No",
      ]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    // The BOM makes Excel read the file as UTF-8 (Hindi vendor names / notes stay readable).
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `expenses-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const setF = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const setT = (key) => (e) => setTemplateForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Expenses</h2>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm(emptyExpense());
          }}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg px-4 py-2"
        >
          + Add expense
        </button>
      </div>

      {message && (
        <p role="status" className="mb-4 text-sm bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-slate-700">
          {message}
        </p>
      )}

      {form && (
        <div className="border border-slate-200 rounded-xl bg-white p-5 mb-6">
          <h3 className="font-semibold text-slate-800 mb-4">{editingId ? "Edit expense" : "New expense"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Date">
              <input type="date" value={form.date} onChange={setF("date")} className={inputClass} />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={setF("category")} className={inputClass}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount (₹)">
              <input type="number" min="0" step="0.01" value={form.amount} onChange={setF("amount")} className={inputClass} />
            </Field>
            <Field label="Vendor">
              <input type="text" maxLength={100} value={form.vendor} onChange={setF("vendor")} className={inputClass} />
            </Field>
            <Field label="Payment mode">
              <select value={form.paymentMode} onChange={setF("paymentMode")} className={inputClass}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Note">
              <input type="text" maxLength={300} value={form.note} onChange={setF("note")} className={inputClass} />
            </Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={saveExpense}
              disabled={saving}
              className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
              className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <Field label="Period">
          <div className="flex gap-2">
            <input
              type="month"
              value={period === "all" ? "" : period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setPeriod(period === "all" ? istToday().slice(0, 7) : "all")}
              className="border border-slate-300 text-slate-700 text-sm rounded-lg px-3 py-2 whitespace-nowrap"
            >
              {period === "all" ? "This month" : "All time"}
            </button>
          </div>
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          onClick={exportCsv}
          disabled={expenses.length === 0}
          className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="border border-slate-200 rounded-xl bg-white p-5">
          <p className="text-sm text-slate-500">Total expenses{period === "all" ? " (all time)" : ""}</p>
          <p className="text-2xl font-bold text-slate-900">{rupees(totals.total)}</p>
        </div>
        <div className="lg:col-span-2 border border-slate-200 rounded-xl bg-white p-5">
          <p className="text-sm text-slate-500 mb-2">By category</p>
          {totals.byCategory.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing recorded for this selection.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {totals.byCategory.map((c) => (
                <li key={c.category} className="flex justify-between text-slate-700">
                  <span>
                    {c.category} <span className="text-slate-400">({c.count})</span>
                  </span>
                  <span className="font-medium">{rupees(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto mb-10">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Vendor / note</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No expenses for this selection.
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e._id}>
                  <td className="px-4 py-3 whitespace-nowrap">{displayDate(e.date)}</td>
                  <td className="px-4 py-3">{e.category}</td>
                  <td className="px-4 py-3">
                    {e.vendor && <span className="font-medium text-slate-800">{e.vendor}</span>}
                    {e.note && <span className="block text-slate-500 text-xs">{e.note}</span>}
                    {e.recurringTemplate && (
                      <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
                        Recurring
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{rupees(e.amount)}</td>
                  <td className="px-4 py-3">{e.paymentMode}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button type="button" onClick={() => startEditExpense(e)} className="text-blue-700 hover:underline mr-3">
                      Edit
                    </button>
                    <button type="button" onClick={() => removeExpense(e)} className="text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Recurring expenses</h3>
          <p className="text-sm text-slate-500">
            Subscriptions are added to the ledger automatically on their date each month. Yearly bills
            (like a domain) are spread evenly over 12 months.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTemplateEditingId(null);
            setTemplateForm(emptyTemplate());
          }}
          className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2"
        >
          + Add recurring
        </button>
      </div>

      {templateForm && (
        <div className="border border-slate-200 rounded-xl bg-white p-5 mb-4">
          <h3 className="font-semibold text-slate-800 mb-4">
            {templateEditingId ? "Edit recurring expense" : "New recurring expense"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Name">
              <input type="text" maxLength={100} value={templateForm.name} onChange={setT("name")} className={inputClass} />
            </Field>
            <Field label="Category">
              <select value={templateForm.category} onChange={setT("category")} className={inputClass}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount (₹)">
              <input type="number" min="0" step="0.01" value={templateForm.amount} onChange={setT("amount")} className={inputClass} />
            </Field>
            <Field label="Billing">
              <select value={templateForm.billing} onChange={setT("billing")} className={inputClass}>
                <option value="monthly">Monthly (amount charged every month)</option>
                <option value="yearly-spread">Yearly price (spread over 12 months)</option>
              </select>
            </Field>
            <Field label="First charge date">
              <input type="date" value={templateForm.startDate} onChange={setT("startDate")} className={inputClass} />
            </Field>
            <Field label="Vendor">
              <input type="text" maxLength={100} value={templateForm.vendor} onChange={setT("vendor")} className={inputClass} />
            </Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={saveTemplate}
              disabled={saving}
              className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTemplateForm(null);
                setTemplateEditingId(null);
              }}
              className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Billing</th>
              <th className="px-4 py-3">Since</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {templates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No recurring expenses yet.
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t._id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                  <td className="px-4 py-3">{t.category}</td>
                  <td className="px-4 py-3 text-right">
                    {rupees(t.amount)}
                    {t.billing === "yearly-spread" && (
                      <span className="block text-xs text-slate-400">≈ {rupees(t.amount / 12)}/month</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{t.billing === "monthly" ? "Monthly" : "Yearly (spread)"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{displayDate(t.startDate)}</td>
                  <td className="px-4 py-3">{t.isActive ? "Active" : "Stopped"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button type="button" onClick={() => startEditTemplate(t)} className="text-blue-700 hover:underline mr-3">
                      Edit
                    </button>
                    {t.isActive && (
                      <button type="button" onClick={() => stopTemplate(t)} className="text-red-600 hover:underline">
                        Stop
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminExpenses;
