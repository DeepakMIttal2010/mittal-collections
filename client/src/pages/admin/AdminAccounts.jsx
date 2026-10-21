import { useCallback, useEffect, useState } from "react";

import ChartOfAccounts from "../../components/admin/accounts/ChartOfAccounts";
import VouchersTab from "../../components/admin/accounts/VouchersTab";
import AccountingSettingsTab from "../../components/admin/accounts/AccountingSettingsTab";
import {
  getAccountingSettings,
  getGroups,
  getLedgers,
  syncBooks,
} from "../../services/adminAccountsService";
import { rupees } from "../../components/admin/accounts/helpers";

const TABS = [
  { key: "chart", label: "Chart of Accounts" },
  { key: "vouchers", label: "Vouchers" },
  { key: "settings", label: "Settings" },
];

// Turns a sync result into one readable line, or "" when nothing happened
// and there is nothing to warn about (the automatic sync on page open
// should be silent when the books were already up to date).
const describeSync = (r, { always } = {}) => {
  const parts = [];
  if (r.created) parts.push(`${r.created} new`);
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.voided) parts.push(`${r.voided} removed`);
  if (r.stockAdjustment) parts.push(`stock value adjusted by ${rupees(Math.abs(r.stockAdjustment))}`);

  const warnings = [];
  const unposted = (r.skipped?.locked || 0) + (r.skipped?.["before-books-start"] || 0);
  if (unposted) warnings.push(`${unposted} entries could not be posted (locked period or before the books start date)`);
  if (r.missingCost) warnings.push(`${r.missingCost} shipped order(s) have no cost recorded, so their cost of goods is not posted`);

  if (!parts.length && !warnings.length) return always ? "Books are up to date." : "";

  return [parts.length ? `Books synced: ${parts.join(", ")}.` : "", ...warnings.map((w) => `${w}.`)].filter(Boolean).join(" ");
};

// Tally-style books: groups -> sub-groups -> ledgers, and vouchers that
// must balance (Dr = Cr). Orders (when shipped), returns, POS sales and
// expenses post themselves; the page syncs on open and has a Sync button.
// Reports (Trial Balance, Trading/P&L, Balance Sheet) come next.
function AdminAccounts() {
  const [tab, setTab] = useState("chart");
  const [groups, setGroups] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [openingDifference, setOpeningDifference] = useState(0);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [g, l, s] = await Promise.all([getGroups(), getLedgers(), getAccountingSettings()]);

    if (g.success) setGroups(g.groups);
    if (l.success) {
      setLedgers(l.ledgers);
      setOpeningDifference(l.openingDifference);
    }
    if (s.success) setSettings(s.settings);

    if (!g.success || !l.success || !s.success) {
      setMessage(g.message || l.message || s.message || "Could not load the books.");
    }

    setLoading(false);
  }, []);

  const sync = useCallback(
    async ({ quiet }) => {
      setSyncing(true);
      const res = await syncBooks();
      setSyncing(false);

      if (!res.success) {
        setMessage(res.message || "Could not sync the books.");
      } else if (res.busy) {
        setMessage(res.message);
      } else {
        const text = describeSync(res.result, { always: !quiet });
        if (text) setMessage(text);
      }

      await load();
    },
    [load],
  );

  // Opening the books first brings them up to date, silently if nothing changed.
  useEffect(() => {
    sync({ quiet: true });
  }, [sync]);

  const notify = useCallback((text) => setMessage(text), []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Accounts (Books)</h2>
          <p className="text-sm text-slate-500">Groups, ledgers and vouchers, Tally style.</p>
        </div>
        <button
          type="button"
          onClick={() => sync({ quiet: false })}
          disabled={syncing}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold rounded-lg px-4 py-2"
        >
          {syncing ? "Syncing..." : "Sync books"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${
              tab === t.key ? "border-slate-800 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p role="status" className="mb-4 text-sm bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-slate-700">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <>
          {tab === "chart" && (
            <ChartOfAccounts
              groups={groups}
              ledgers={ledgers}
              openingDifference={openingDifference}
              onChanged={load}
              notify={notify}
            />
          )}
          {tab === "vouchers" && <VouchersTab ledgers={ledgers} notify={notify} onChanged={load} />}
          {tab === "settings" && settings && (
            <AccountingSettingsTab settings={settings} onChanged={load} notify={notify} />
          )}
        </>
      )}
    </div>
  );
}

export default AdminAccounts;
