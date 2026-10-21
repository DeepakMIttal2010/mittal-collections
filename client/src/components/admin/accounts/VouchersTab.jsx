import { useCallback, useEffect, useMemo, useState } from "react";

import Field from "./shared";
import { inputClass, VOUCHER_TYPES, istToday, rupees, displayDate, toPaise } from "./helpers";
import {
  getVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
} from "../../../services/adminAccountsService";

const blankLine = (side) => ({ ledger: "", side, amount: "" });

const blankForm = () => ({
  type: "Payment",
  date: istToday(),
  narration: "",
  entries: [blankLine("Dr"), blankLine("Cr")],
});

function VouchersTab({ ledgers, notify, onChanged }) {
  const [period, setPeriod] = useState("all"); // "YYYY-MM" | "all"
  const [type, setType] = useState("");
  const [ledgerFilter, setLedgerFilter] = useState("");
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const activeLedgers = useMemo(() => ledgers.filter((l) => l.isActive), [ledgers]);

  // <optgroup> per group, like picking a ledger in Tally.
  const ledgerOptions = useMemo(() => {
    const byGroup = new Map();
    activeLedgers.forEach((l) => {
      const key = l.group?.name || "Other";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(l);
    });
    return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeLedgers]);

  const load = useCallback(async () => {
    setLoading(true);

    const filters = { type, ledger: ledgerFilter };
    if (period !== "all") {
      const [y, m] = period.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      filters.from = `${period}-01`;
      filters.to = `${period}-${String(last).padStart(2, "0")}`;
    }

    const res = await getVouchers(filters);
    if (res.success) setVouchers(res.vouchers);
    else notify(res.message || "Could not load vouchers.");

    setLoading(false);
  }, [type, ledgerFilter, period, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    if (!form) return { dr: 0, cr: 0, valid: false };

    let dr = 0;
    let cr = 0;
    let complete = true;

    form.entries.forEach((e) => {
      const p = toPaise(e.amount);
      if (!e.ledger || !p || p < 1) complete = false;
      if (p && e.side === "Dr") dr += p;
      if (p && e.side === "Cr") cr += p;
    });

    return { dr, cr, valid: complete && form.entries.length >= 2 && dr === cr && dr > 0 };
  }, [form]);

  const setLine = (i, key, value) =>
    setForm((p) => ({ ...p, entries: p.entries.map((e, idx) => (idx === i ? { ...e, [key]: value } : e)) }));

  const addLine = () =>
    setForm((p) => {
      // Offer the side that currently needs balancing.
      const dr = p.entries.filter((e) => e.side === "Dr").reduce((s, e) => s + (toPaise(e.amount) || 0), 0);
      const cr = p.entries.filter((e) => e.side === "Cr").reduce((s, e) => s + (toPaise(e.amount) || 0), 0);
      const line = blankLine(dr > cr ? "Cr" : "Dr");
      const gap = Math.abs(dr - cr);
      if (gap) line.amount = String(gap / 100);
      return { ...p, entries: [...p.entries, line] };
    });

  const removeLine = (i) => setForm((p) => ({ ...p, entries: p.entries.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);

    const body = {
      type: form.type,
      date: form.date,
      narration: form.narration,
      entries: form.entries.map((e) => ({ ledger: e.ledger, side: e.side, amount: Number(e.amount) })),
    };
    const res = editingId ? await updateVoucher(editingId, body) : await createVoucher(body);

    setSaving(false);

    if (!res.success) {
      notify(res.message || "Could not save the voucher.");
      return;
    }

    notify(`${editingId ? "Updated" : "Saved"} ${res.voucher.number}.`);
    setForm(null);
    setEditingId(null);
    load();
    onChanged(); // ledger balances (Chart of Accounts) changed too
  };

  const startEdit = (v) => {
    setEditingId(v._id);
    setForm({
      type: v.type,
      date: v.date,
      narration: v.narration || "",
      entries: v.entries.map((e) => ({ ledger: e.ledger._id, side: e.side, amount: String(e.amount) })),
    });
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete voucher ${v.number}? It is kept in the audit log but removed from the books.`)) return;

    const res = await deleteVoucher(v._id);
    notify(res.success ? `Voucher ${v.number} deleted.` : res.message || "Could not delete.");
    if (res.success) {
      load();
      onChanged();
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
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
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              <option value="">All types</option>
              {VOUCHER_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Ledger">
            <select value={ledgerFilter} onChange={(e) => setLedgerFilter(e.target.value)} className={inputClass}>
              <option value="">All ledgers</option>
              {ledgerOptions.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((l) => (
                    <option key={l._id} value={l._id}>{l.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm(blankForm());
          }}
          className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg px-4 py-2"
        >
          + New voucher
        </button>
      </div>

      {form && (
        <div className="border border-slate-200 rounded-xl bg-white p-5 mb-6">
          <h3 className="font-semibold text-slate-800 mb-4">{editingId ? "Edit voucher" : "New voucher"}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Field label="Voucher type">
              <select
                value={form.type}
                disabled={!!editingId}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className={inputClass}
              >
                {VOUCHER_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="Narration">
              <input type="text" maxLength={500} value={form.narration} onChange={(e) => setForm((p) => ({ ...p, narration: e.target.value }))} className={inputClass} />
            </Field>
          </div>

          <div className="space-y-2">
            {form.entries.map((e, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select value={e.side} onChange={(ev) => setLine(i, "side", ev.target.value)} aria-label={`Line ${i + 1} side`} className="col-span-2 sm:col-span-1 border border-slate-300 rounded-lg px-2 py-2 text-sm">
                  <option>Dr</option>
                  <option>Cr</option>
                </select>
                <select value={e.ledger} onChange={(ev) => setLine(i, "ledger", ev.target.value)} aria-label={`Line ${i + 1} ledger`} className={`${inputClass} col-span-10 sm:col-span-7`}>
                  <option value="">Select ledger...</option>
                  {ledgerOptions.map(([group, list]) => (
                    <optgroup key={group} label={group}>
                      {list.map((l) => (
                        <option key={l._id} value={l._id}>{l.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={e.amount}
                  onChange={(ev) => setLine(i, "amount", ev.target.value)}
                  aria-label={`Line ${i + 1} amount`}
                  placeholder="Amount"
                  className={`${inputClass} col-span-8 sm:col-span-3`}
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={form.entries.length <= 2}
                  aria-label={`Remove line ${i + 1}`}
                  className="col-span-4 sm:col-span-1 text-red-600 disabled:opacity-30 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addLine} className="mt-3 text-sm text-blue-700 hover:underline">
            + Add line
          </button>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-600">Debit: <strong>{rupees(totals.dr / 100)}</strong></span>
            <span className="text-slate-600">Credit: <strong>{rupees(totals.cr / 100)}</strong></span>
            {totals.dr !== totals.cr ? (
              <span className="text-red-600 font-medium">Difference: {rupees(Math.abs(totals.dr - totals.cr) / 100)}</span>
            ) : (
              totals.dr > 0 && <span className="text-green-700 font-medium">Balanced</span>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={save}
              disabled={saving || !totals.valid}
              className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2"
            >
              {saving ? "Saving..." : "Save voucher"}
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

      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Voucher</th>
              <th className="px-4 py-3">Particulars</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading...</td></tr>
            ) : vouchers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No vouchers for this selection.</td></tr>
            ) : (
              vouchers.map((v) => (
                <tr key={v._id}>
                  <td className="px-4 py-3 whitespace-nowrap">{displayDate(v.date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium text-slate-800">{v.number}</span>
                    <span className="block text-xs text-slate-400">{v.type}{v.source ? " · automatic" : ""}</span>
                  </td>
                  <td className="px-4 py-3">
                    {v.entries.map((e, i) => (
                      <span key={i} className="block text-slate-700">
                        <span className="text-xs text-slate-400 mr-2">{e.side}</span>
                        {e.ledger.name}
                        <span className="text-slate-400"> {rupees(e.amount)}</span>
                      </span>
                    ))}
                    {v.narration && <span className="block text-xs text-slate-500 mt-1">{v.narration}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{rupees(v.total)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {!v.source && (
                      <button type="button" onClick={() => startEdit(v)} className="text-blue-700 hover:underline mr-3">Edit</button>
                    )}
                    {!v.source && (
                      <button type="button" onClick={() => remove(v)} className="text-red-600 hover:underline">Delete</button>
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

export default VouchersTab;
