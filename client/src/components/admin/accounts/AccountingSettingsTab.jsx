import { useState } from "react";

import Field from "./shared";
import { inputClass, displayDate } from "./helpers";
import { updateAccountingSettings } from "../../../services/adminAccountsService";

function AccountingSettingsTab({ settings, onChanged, notify }) {
  const [lockDate, setLockDate] = useState(settings.lockedThrough || "");
  const [saving, setSaving] = useState(false);

  const save = async (value) => {
    setSaving(true);
    const res = await updateAccountingSettings({ lockedThrough: value });
    setSaving(false);

    if (!res.success) {
      notify(res.message || "Could not save.");
      return;
    }

    notify(value ? `Books are locked up to ${displayDate(value)}.` : "Period lock removed.");
    onChanged();
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="border border-slate-200 rounded-xl bg-white p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Financial year</h3>
        <p className="text-sm text-slate-600">
          Books start on <strong>{displayDate(settings.booksStartDate)}</strong>. Current financial year:{" "}
          <strong>{settings.currentFy}</strong> (1 April – 31 March). Opening balances are as on the start date.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl bg-white p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Lock a closed period</h3>
        <p className="text-sm text-slate-600 mb-4">
          No voucher dated on or before the lock date can be added, edited or deleted. Use this after your
          accountant has finalised a month or year.
          {settings.lockedThrough && (
            <> Currently locked through <strong>{displayDate(settings.lockedThrough)}</strong>.</>
          )}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Lock through (date)">
            <input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} className={inputClass} />
          </Field>
          <button
            type="button"
            disabled={saving || !lockDate}
            onClick={() => save(lockDate)}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2"
          >
            Lock
          </button>
          {settings.lockedThrough && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setLockDate("");
                save(null);
              }}
              className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2"
            >
              Remove lock
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountingSettingsTab;
