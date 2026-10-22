import { useEffect, useMemo, useState } from "react";

import Field from "./shared";
import { inputClass, istToday, num, rupees, displayDate, defaultFyStart, downloadCsv, VOUCHER_TYPES } from "./helpers";
import { getReport } from "../../../services/adminAccountsService";

const REPORTS = [
  { key: "trading-pl", label: "Trading & P&L", kind: "range" },
  { key: "balance-sheet", label: "Balance Sheet", kind: "asof" },
  { key: "trial-balance", label: "Trial Balance", kind: "asof" },
  { key: "group-summary", label: "Group Summary", kind: "range" },
  { key: "ledger", label: "Ledger", kind: "range" },
  { key: "day-book", label: "Day Book", kind: "range" },
];

const withSide = (amount, side) => (amount ? `${num(amount)} ${side}` : "—");

const indent = (depth) => ({ paddingLeft: `${12 + depth * 18}px` });

function BalanceNotice({ balanced, difference }) {
  if (balanced) {
    return <p className="mb-4 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-green-800">Books are balanced.</p>;
  }

  return (
    <p role="alert" className="mb-4 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-800">
      Books do not balance: difference of {rupees(Math.abs(difference))}. This is usually opening balances that don&apos;t
      match - adjust a ledger&apos;s opening balance (often Proprietor&apos;s Capital) in the Chart of Accounts.
    </p>
  );
}

// One side (Dr or Cr) of a Tally-style account: indented rows + a total.
function SideTable({ title, rows, total, onLedger }) {
  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <h4 className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-50 border-b border-slate-200">{title}</h4>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-3 text-slate-400">Nothing to show.</td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={`${row.kind}-${row.id || row.name}-${i}`} className={row.kind === "balance" ? "bg-amber-50" : ""}>
              <td className={`py-2 pr-3 ${row.kind === "ledger" ? "text-slate-700" : "font-semibold text-slate-800"}`} style={indent(row.depth)}>
                {row.kind === "ledger" && onLedger ? (
                  <button type="button" onClick={() => onLedger(row.id)} className="text-blue-700 hover:underline text-left">
                    {row.name}
                  </button>
                ) : (
                  row.name
                )}
              </td>
              <td className={`py-2 px-4 text-right whitespace-nowrap ${row.kind === "ledger" ? "text-slate-600" : "font-semibold"}`}>
                {num(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
            <td className="px-3 py-2.5">Total</td>
            <td className="px-4 py-2.5 text-right">{num(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TradingPLView({ data, onLedger }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-800 mb-2">
          Trading Account <span className="text-sm font-normal text-slate-500">{displayDate(data.from)} to {displayDate(data.to)}</span>
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SideTable title="Particulars (Dr)" rows={data.trading.left} total={data.trading.total} onLedger={onLedger} />
          <SideTable title="Particulars (Cr)" rows={data.trading.right} total={data.trading.total} onLedger={onLedger} />
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-slate-800 mb-2">Profit &amp; Loss Account</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SideTable title="Particulars (Dr)" rows={data.profitLoss.left} total={data.profitLoss.total} onLedger={onLedger} />
          <SideTable title="Particulars (Cr)" rows={data.profitLoss.right} total={data.profitLoss.total} onLedger={onLedger} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Stock is tracked as you sell, so cost of goods appears as a Direct Expense (there are no opening/closing stock
        lines). Net {data.netProfit >= 0 ? "profit" : "loss"}: <strong>{rupees(Math.abs(data.netProfit))}</strong>.
      </p>
    </div>
  );
}

function BalanceSheetView({ data, onLedger }) {
  return (
    <div>
      <BalanceNotice balanced={data.balanced} difference={data.difference} />
      <h3 className="font-semibold text-slate-800 mb-2">
        Balance Sheet <span className="text-sm font-normal text-slate-500">as at {displayDate(data.asOf)}</span>
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SideTable title="Liabilities" rows={data.liabilities.rows} total={data.liabilities.total} onLedger={onLedger} />
        <SideTable title="Assets" rows={data.assets.rows} total={data.assets.total} onLedger={onLedger} />
      </div>
    </div>
  );
}

function TrialBalanceView({ data, onLedger }) {
  return (
    <div>
      <BalanceNotice balanced={data.balanced} difference={data.difference} />
      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Particulars <span className="font-normal text-slate-400">as at {displayDate(data.asOf)}</span></th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((row, i) => (
              <tr key={`${row.id}-${i}`}>
                <td className={`py-2 pr-3 ${row.kind === "group" ? "font-semibold text-slate-800" : "text-slate-700"}`} style={indent(row.depth)}>
                  {row.kind === "ledger" ? (
                    <button type="button" onClick={() => onLedger(row.id)} className="text-blue-700 hover:underline text-left">{row.name}</button>
                  ) : (
                    row.name
                  )}
                </td>
                <td className="px-4 py-2 text-right">{row.debit ? num(row.debit) : ""}</td>
                <td className="px-4 py-2 text-right">{row.credit ? num(row.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
              <td className="px-4 py-2.5">Grand Total</td>
              <td className="px-4 py-2.5 text-right">{num(data.totalDebit)}</td>
              <td className="px-4 py-2.5 text-right">{num(data.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500 mt-2">Group rows show the net of everything inside them; ledgers with a zero balance are hidden.</p>
    </div>
  );
}

function GroupSummaryView({ data, onGroup, onLedger }) {
  return (
    <div>
      <nav className="mb-3 text-sm flex flex-wrap items-center gap-1" aria-label="Group path">
        <button type="button" onClick={() => onGroup("")} className="text-blue-700 hover:underline">All groups</button>
        {data.breadcrumb.map((b) => (
          <span key={b.id} className="flex items-center gap-1">
            <span className="text-slate-400">›</span>
            <button type="button" onClick={() => onGroup(b.id)} className="text-blue-700 hover:underline">{b.name}</button>
          </span>
        ))}
      </nav>
      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Particulars</th>
              <th className="px-4 py-3 text-right">Opening</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Closing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nothing in this group.</td></tr>
            )}
            {data.items.map((it) => (
              <tr key={`${it.kind}-${it.id}`}>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => (it.kind === "group" ? onGroup(it.id) : onLedger(it.id))}
                    className={`text-left hover:underline ${it.kind === "group" ? "font-semibold text-blue-800" : "text-blue-700"}`}
                  >
                    {it.name}
                  </button>
                </td>
                <td className="px-4 py-2 text-right text-slate-500">{withSide(it.opening, it.openingSide)}</td>
                <td className="px-4 py-2 text-right">{it.debit ? num(it.debit) : "—"}</td>
                <td className="px-4 py-2 text-right">{it.credit ? num(it.credit) : "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{withSide(it.closing, it.closingSide)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
              <td className="px-4 py-2.5">Total</td>
              <td />
              <td className="px-4 py-2.5 text-right">{num(data.totals.debit)}</td>
              <td className="px-4 py-2.5 text-right">{num(data.totals.credit)}</td>
              <td className="px-4 py-2.5 text-right">{withSide(data.totals.closing, data.totals.closingSide)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function LedgerView({ data }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-800">{data.ledger.name}</h3>
      <p className="text-sm text-slate-500 mb-3">{data.ledger.group} · {displayDate(data.from)} to {displayDate(data.to)}</p>
      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Particulars</th>
              <th className="px-4 py-3">Voucher</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/60">
              <td className="px-4 py-2" colSpan={5}>Opening balance</td>
              <td className="px-4 py-2 text-right font-medium">{withSide(data.opening, data.openingSide)}</td>
            </tr>
            {data.lines.map((l) => (
              <tr key={`${l.voucherId}-${l.number}`}>
                <td className="px-4 py-2 whitespace-nowrap">{displayDate(l.date)}</td>
                <td className="px-4 py-2">
                  {l.particulars}
                  {l.narration && <span className="block text-xs text-slate-500">{l.narration}</span>}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{l.number}</td>
                <td className="px-4 py-2 text-right">{l.debit ? num(l.debit) : ""}</td>
                <td className="px-4 py-2 text-right">{l.credit ? num(l.credit) : ""}</td>
                <td className="px-4 py-2 text-right">{withSide(l.balance, l.balanceSide)}</td>
              </tr>
            ))}
            {data.lines.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No entries in this period.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
              <td className="px-4 py-2.5" colSpan={3}>Closing balance</td>
              <td className="px-4 py-2.5 text-right">{num(data.totalDebit)}</td>
              <td className="px-4 py-2.5 text-right">{num(data.totalCredit)}</td>
              <td className="px-4 py-2.5 text-right">{withSide(data.closing, data.closingSide)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function DayBookView({ data }) {
  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        {data.count} voucher{data.count === 1 ? "" : "s"} · total {rupees(data.total)}
      </p>
      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Voucher</th>
              <th className="px-4 py-3">Particulars</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.vouchers.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No vouchers in this period.</td></tr>
            )}
            {data.vouchers.map((v) => (
              <tr key={v.voucherId}>
                <td className="px-4 py-3 whitespace-nowrap align-top">{displayDate(v.date)}</td>
                <td className="px-4 py-3 whitespace-nowrap align-top">
                  <span className="font-medium text-slate-800">{v.number}</span>
                  <span className="block text-xs text-slate-400">{v.type}{v.automatic ? " · automatic" : ""}</span>
                </td>
                <td className="px-4 py-3">
                  {v.entries.map((e, i) => (
                    <span key={i} className="block text-slate-700">
                      <span className="text-xs text-slate-400 mr-2">{e.side}</span>
                      {e.ledger}
                      <span className="text-slate-400"> {num(e.amount)}</span>
                    </span>
                  ))}
                  {v.narration && <span className="block text-xs text-slate-500 mt-1">{v.narration}</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold align-top">{num(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ CSV
const flat = (rows) => rows.map((r) => [`${"  ".repeat(r.depth)}${r.name}`, r.amount]);

const csvFor = (report, data) => {
  if (report === "trial-balance") {
    return [["Particulars", "Debit", "Credit"], ...data.rows.map((r) => [`${"  ".repeat(r.depth)}${r.name}`, r.debit || "", r.credit || ""]), ["Grand Total", data.totalDebit, data.totalCredit]];
  }
  if (report === "trading-pl") {
    const section = (name, rows) => rows.map(([p, a]) => [name, p, a]);
    return [
      ["Section", "Particulars", "Amount"],
      ...section("Trading A/c Dr", flat(data.trading.left)),
      ...section("Trading A/c Cr", flat(data.trading.right)),
      ...section("Profit & Loss A/c Dr", flat(data.profitLoss.left)),
      ...section("Profit & Loss A/c Cr", flat(data.profitLoss.right)),
    ];
  }
  if (report === "balance-sheet") {
    return [
      ["Side", "Particulars", "Amount"],
      ...flat(data.liabilities.rows).map(([p, a]) => ["Liabilities", p, a]),
      ["Liabilities", "Total", data.liabilities.total],
      ...flat(data.assets.rows).map(([p, a]) => ["Assets", p, a]),
      ["Assets", "Total", data.assets.total],
    ];
  }
  if (report === "group-summary") {
    return [
      ["Particulars", "Opening", "Opening Dr/Cr", "Debit", "Credit", "Closing", "Closing Dr/Cr"],
      ...data.items.map((i) => [i.name, i.opening, i.openingSide, i.debit, i.credit, i.closing, i.closingSide]),
    ];
  }
  if (report === "ledger") {
    return [
      ["Date", "Voucher", "Particulars", "Narration", "Debit", "Credit", "Balance", "Dr/Cr"],
      ["", "", "Opening balance", "", "", "", data.opening, data.openingSide],
      ...data.lines.map((l) => [l.date, l.number, l.particulars, l.narration, l.debit || "", l.credit || "", l.balance, l.balanceSide]),
      ["", "", "Closing balance", "", data.totalDebit, data.totalCredit, data.closing, data.closingSide],
    ];
  }
  return [
    ["Date", "Voucher", "Type", "Ledger", "Dr/Cr", "Amount", "Narration"],
    ...data.vouchers.flatMap((v) => v.entries.map((e) => [v.date, v.number, v.type, e.ledger, e.side, e.amount, v.narration])),
  ];
};

// =============================================================== the tab
function ReportsTab({ ledgers, settings, notify }) {
  const today = istToday();
  const [report, setReport] = useState("trading-pl");
  const [from, setFrom] = useState(() => defaultFyStart(settings.booksStartDate));
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [ledgerId, setLedgerId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [voucherType, setVoucherType] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const meta = REPORTS.find((r) => r.key === report);

  const ledgerOptions = useMemo(() => {
    const byGroup = new Map();
    ledgers.forEach((l) => {
      const key = l.group?.name || "Other";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(l);
    });
    return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ledgers]);

  useEffect(() => {
    if (report === "ledger" && !ledgerId) {
      setData(null);
      return undefined;
    }

    let cancelled = false;
    const name = report === "ledger" ? `ledger/${ledgerId}` : report;
    const params = meta.kind === "asof" ? { asOf } : { from, to };
    if (report === "group-summary") params.group = groupId;
    if (report === "day-book") params.type = voucherType;

    setLoading(true);
    getReport(name, params).then((res) => {
      if (cancelled) return;
      setLoading(false);

      if (res.success) {
        setData(res.report);
      } else {
        setData(null);
        notify(res.message || "Could not load the report.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [report, from, to, asOf, ledgerId, groupId, voucherType, meta.kind, notify]);

  const openLedger = (id) => {
    setLedgerId(id);
    setData(null);
    setReport("ledger");
  };

  const pickReport = (key) => {
    if (key === report) return; // nothing changes, so nothing would reload
    setData(null);
    setReport(key);
  };

  const csvName = `${report}-${meta.kind === "asof" ? asOf : `${from}_to_${to}`}.csv`;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Reports">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={report === r.key}
            onClick={() => pickReport(r.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
              report === r.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-5">
        {meta.kind === "range" ? (
          <>
            <Field label="From">
              <input type="date" value={from} min={settings.booksStartDate} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputClass} />
            </Field>
            <Field label="To">
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputClass} />
            </Field>
          </>
        ) : (
          <Field label="As on">
            <input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={inputClass} />
          </Field>
        )}

        {report === "ledger" && (
          <Field label="Ledger">
            <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className={inputClass}>
              <option value="">Select a ledger...</option>
              {ledgerOptions.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((l) => (
                    <option key={l._id} value={l._id}>{l.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}

        {report === "day-book" && (
          <Field label="Voucher type">
            <select value={voucherType} onChange={(e) => setVoucherType(e.target.value)} className={inputClass}>
              <option value="">All types</option>
              {VOUCHER_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        )}

        <button
          type="button"
          disabled={!data}
          onClick={() => downloadCsv(csvName, csvFor(report, data))}
          className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
        >
          Download CSV
        </button>
      </div>

      {report === "ledger" && !ledgerId && (
        <p className="text-sm text-slate-500">Choose a ledger (or click a ledger name in any other report) to see its statement.</p>
      )}

      {loading && !data && <p className="text-sm text-slate-400">Loading...</p>}

      {data && (
        <div className={loading ? "opacity-60" : ""}>
          {report === "trading-pl" && <TradingPLView data={data} onLedger={openLedger} />}
          {report === "balance-sheet" && <BalanceSheetView data={data} onLedger={openLedger} />}
          {report === "trial-balance" && <TrialBalanceView data={data} onLedger={openLedger} />}
          {report === "group-summary" && <GroupSummaryView data={data} onGroup={setGroupId} onLedger={openLedger} />}
          {report === "ledger" && <LedgerView data={data} />}
          {report === "day-book" && <DayBookView data={data} />}
        </div>
      )}
    </div>
  );
}

export default ReportsTab;
