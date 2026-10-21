import { useCallback, useEffect, useState } from "react";

import ChartOfAccounts from "../../components/admin/accounts/ChartOfAccounts";
import VouchersTab from "../../components/admin/accounts/VouchersTab";
import AccountingSettingsTab from "../../components/admin/accounts/AccountingSettingsTab";
import {
  getAccountingSettings,
  getGroups,
  getLedgers,
} from "../../services/adminAccountsService";

const TABS = [
  { key: "chart", label: "Chart of Accounts" },
  { key: "vouchers", label: "Vouchers" },
  { key: "settings", label: "Settings" },
];

// Tally-style books: groups -> sub-groups -> ledgers, and vouchers that
// must balance (Dr = Cr). Reports (Trial Balance, Trading/P&L, Balance
// Sheet) and automatic posting from orders arrive in later steps.
function AdminAccounts() {
  const [tab, setTab] = useState("chart");
  const [groups, setGroups] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [openingDifference, setOpeningDifference] = useState(0);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    load();
  }, [load]);

  const notify = useCallback((text) => setMessage(text), []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Accounts (Books)</h2>
      <p className="text-sm text-slate-500 mb-5">Groups, ledgers and vouchers, Tally style.</p>

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
