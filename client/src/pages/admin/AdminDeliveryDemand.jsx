import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaSyncAlt, FaDownload, FaArrowLeft } from "react-icons/fa";

import {
  DEMAND_FILTER_KEYS,
  downloadDeliveryDemandCsv,
  getDeliveryDemandRecords,
  getDeliveryDemandReport,
} from "../../services/deliveryDemandService";

// PR-B2: PIN Code Demand & GST Decision Report. Every number comes from
// the DeliveryDemand collection for the chosen filters. All filters and
// the current drill-down live in the URL, so the browser Back button and
// "Back to Summary" keep them.

const REGIONS = [
  { value: "outside_up", label: "Outside UP (state restriction)" },
  { value: "all", label: "All India" },
  { value: "up", label: "UP — unavailable" },
  { value: "unknown", label: "PIN not verified (India Post)" },
];

const SOURCES = [
  { value: "all", label: "All sources" },
  { value: "product", label: "Product page" },
  { value: "header", label: "Header" },
  { value: "checkout", label: "Checkout" },
];

const VIEW_TITLES = {
  records: "Demand records",
  checkout: "Checkout attempts",
  carts: "Carts behind Potential Value / Estimated Margin",
};

const PAGE_SIZE = 20;

// Review fix M4: the pricing basis, shown on the tile and the cart detail.
const VALUE_BASIS =
  "List-price based estimate – before coupons, bundle discounts, delivery charges and COD charges. NOT REVENUE.";

const rupees = (value) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;

const istDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
    : "";

function MarginCell({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-amber-700 text-xs font-medium">Margin Data Incomplete</span>;
  }
  return <span>{rupees(value)}</span>;
}

function KpiTile({ label, value, note, onClick, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 hover:border-blue-400",
    green: "border-green-200 hover:border-green-500",
    amber: "border-amber-200 hover:border-amber-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white border rounded-xl p-4 shadow-sm transition ${tones[tone]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
      {note && <p className="text-xs text-slate-500 mt-1">{note}</p>}
      <p className="text-xs text-blue-600 mt-2">View details ↗</p>
    </button>
  );
}

function DemandTable({ title, rows, columns, onRowClick, csvTable, onCsv, emptyText = "No demand in this selection." }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [rows]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {csvTable && (
          <button
            type="button"
            onClick={() => onCsv(csvTable)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
          >
            <FaDownload /> CSV (totals only)
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((col) => (
                <th key={col.label} className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                  {emptyText}
                </td>
              </tr>
            )}
            {visible.map((row, index) => (
              <tr
                key={index}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-t border-slate-100 ${onRowClick ? "cursor-pointer hover:bg-blue-50" : ""}`}
              >
                {columns.map((col) => (
                  <td key={col.label} className={`px-3 py-2 ${col.align === "right" ? "text-right" : ""}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 text-xs text-slate-600">
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="px-2 py-1 border rounded disabled:opacity-40">
            Prev
          </button>
          <span>
            Page {page} / {pages}
          </span>
          <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)} className="px-2 py-1 border rounded disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </section>
  );
}

const metricColumns = [
  { label: "Unique customers", key: "uniqueVisitors", align: "right" },
  { label: "Attempts", key: "checks", align: "right" },
  { label: "Checkout attempts", key: "checkoutAttempts", align: "right" },
  { label: "Potential value", align: "right", render: (row) => rupees(row.potentialValue) },
  { label: "Est. margin", align: "right", render: (row) => <MarginCell value={row.estimatedMargin} /> },
];

function RecordsView({ filters, view, page, setParam }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDeliveryDemandRecords({ ...filters, view, page }).then((response) => {
      if (cancelled) return;
      setData(response);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filters, view, page]);

  if (loading) return <p className="text-slate-500">Loading records…</p>;
  if (!data?.success) return <p className="text-red-600">{data?.message || "Unable to load records"}</p>;

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">
          {VIEW_TITLES[view] || VIEW_TITLES.records} — {data.total}
        </h3>
        {view === "carts" && (
          <p className="text-xs text-slate-500">
            Potential Value counts each customer&apos;s latest cart once (marked &quot;Counted&quot;); outlier carts are
            never counted. {VALUE_BASIS}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Last checked</th>
              <th className="px-3 py-2 text-left font-medium min-w-[8rem]">Place</th>
              <th className="px-3 py-2 text-left font-medium min-w-[9rem]">Customer</th>
              <th className="px-3 py-2 text-left font-medium min-w-[8rem]">Source / stage</th>
              <th className="px-3 py-2 text-left font-medium min-w-[9rem]">Reason</th>
              <th className="px-3 py-2 text-left font-medium min-w-[20rem]">Product / cart</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Cart value</th>
              <th className="px-3 py-2 text-right font-medium">Est. cost</th>
              <th className="px-3 py-2 text-right font-medium">Est. margin</th>
              <th className="px-3 py-2 text-right font-medium">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {data.records.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                  No records in this selection.
                </td>
              </tr>
            )}
            {data.records.map((record) => (
              <tr key={record.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{dateTime(record.lastAt)}</td>
                <td className="px-3 py-2">
                  <button type="button" className="text-blue-700 hover:underline" onClick={() => setParam({ pincode: record.pincode })}>
                    {record.pincode}
                  </button>
                  <div className="text-xs text-slate-500">
                    {[record.district, record.state].filter(Boolean).join(", ")}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {record.customer ? (
                    <div>
                      {record.customer.name}
                      <div className="text-xs text-slate-500">{record.customer.mobile}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Anonymous</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {record.sourceLabel}
                  <div className="text-xs text-slate-500">{record.stage}</div>
                </td>
                <td className="px-3 py-2 text-xs">{record.reasonLabel}</td>
                <td className="px-3 py-2">
                  {record.product && (
                    <div>
                      {record.product}
                      {record.category && <span className="text-xs text-slate-500"> · {record.category}</span>}
                    </div>
                  )}
                  {record.items.map((item, i) => (
                    <div key={i} className="text-xs text-slate-600 py-0.5">
                      <div className="text-slate-800">
                        {item.product}
                        {item.size && ` (${item.size})`} × {item.quantity} @ {rupees(item.unitPrice)} = {rupees(item.lineValue)}
                      </div>
                      {item.lineMargin === null ? (
                        <div className="text-amber-700">cost missing – margin not counted</div>
                      ) : (
                        <div>
                          cost {rupees(item.lineCost)} · margin {rupees(item.lineMargin)}
                        </div>
                      )}
                    </div>
                  ))}
                  {record.countedInPotentialValue && (
                    <span className="inline-block mt-1 text-[11px] bg-green-100 text-green-700 rounded px-1.5">Counted</span>
                  )}
                  {record.outlier && (
                    <div className="mt-1 text-[11px] text-red-700">
                      <span className="bg-red-100 rounded px-1.5 font-semibold">Outlier – not in totals</span>{" "}
                      {record.outlierReasons.join("; ")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{record.quantity ?? "—"}</td>
                <td className="px-3 py-2 text-right">{record.cartValue === null ? "—" : rupees(record.cartValue)}</td>
                <td className="px-3 py-2 text-right">
                  {record.cartValue === null ? "—" : record.cartCost === null ? <span className="text-amber-700 text-xs">Incomplete</span> : rupees(record.cartCost)}
                </td>
                <td className="px-3 py-2 text-right">{record.cartValue === null ? "—" : <MarginCell value={record.estimatedMargin} />}</td>
                <td className="px-3 py-2 text-right">{record.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.pages > 1 && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 text-xs text-slate-600">
          <button type="button" disabled={data.page === 1} onClick={() => setParam({ page: String(data.page - 1) })} className="px-2 py-1 border rounded disabled:opacity-40">
            Prev
          </button>
          <span>
            Page {data.page} / {data.pages}
          </span>
          <button type="button" disabled={data.page === data.pages} onClick={() => setParam({ page: String(data.page + 1) })} className="px-2 py-1 border rounded disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function AdminDeliveryDemand() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  const paramsKey = searchParams.toString();
  const filters = useMemo(() => {
    const params = new URLSearchParams(paramsKey);
    const result = {};
    for (const key of DEMAND_FILTER_KEYS) result[key] = params.get(key) || "";
    if (!result.region) result.region = "outside_up";
    return result;
  }, [paramsKey]);
  const view = searchParams.get("view") || "summary";
  const page = searchParams.get("page") || "1";

  // Merges changes into the URL; any filter change resets the page.
  const setParam = useCallback(
    (changes) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === "" || value === null || value === undefined) next.delete(key);
          else next.set(key, value);
        }
        if (!("page" in changes)) next.delete("page");
        return next;
      });
    },
    [setSearchParams],
  );

  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    if (view !== "summary") return undefined;
    let cancelled = false;
    setLoading(true);
    getDeliveryDemandReport(JSON.parse(filtersKey)).then((response) => {
      if (cancelled) return;
      setReport(response);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filtersKey, view, refreshKey]);

  // Review UI fix: descriptive file name built here (the server's
  // Content-Disposition header isn't readable cross-origin).
  const onCsv = async (table) => {
    const safe = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const filename = [
      "delivery-demand",
      table,
      filters.region || "outside_up",
      `${filters.from || istDate(29)}-to-${filters.to || istDate()}`,
      ...[filters.state, filters.district, filters.pincode].filter(Boolean).map(safe),
    ].join("_") + ".csv";
    const result = await downloadDeliveryDemandCsv(table, filters, filename);
    setNotice(result.success ? "" : "CSV download failed. Please try again.");
  };

  const totals = report?.totals;
  const options = report?.options || { states: [], districts: [], categories: [], products: [] };

  const crumbs = [
    filters.state && { label: `State: ${filters.state}`, clear: { state: "", district: "", pincode: "" } },
    filters.district && { label: `District: ${filters.district}`, clear: { district: "", pincode: "" } },
    filters.pincode && { label: `PIN: ${filters.pincode}`, clear: { pincode: "" } },
    filters.product && {
      label: `Product: ${options.products.find((p) => p.id === filters.product)?.name || "selected"}`,
      clear: { product: "" },
    },
    filters.category && {
      label: `Category: ${options.categories.find((c) => c.id === filters.category)?.name || "selected"}`,
      clear: { category: "" },
    },
  ].filter(Boolean);

  const inputClass = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white";

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">PIN Code Demand &amp; GST Decision Report</h2>
          <p className="text-sm text-slate-500 mt-1">
            Shoppers who checked a PIN code we can&apos;t deliver to yet. Helps decide whether a GST registration for
            outside-UP delivery is worth it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          className="inline-flex items-center gap-2 text-sm font-medium border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50"
        >
          <FaSyncAlt /> Refresh
        </button>
      </div>

      <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
        POTENTIAL VALUE – NOT REVENUE · ESTIMATED MARGIN – NOT ACTUAL PROFIT · Demand checks are not orders.
      </p>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-slate-600">
          From
          <input type="date" className={`${inputClass} w-full mt-1`} value={filters.from || istDate(29)} max={istDate()} onChange={(e) => setParam({ from: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600">
          To
          <input type="date" className={`${inputClass} w-full mt-1`} value={filters.to || istDate()} max={istDate()} onChange={(e) => setParam({ to: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600">
          Region
          <select className={`${inputClass} w-full mt-1`} value={filters.region} onChange={(e) => setParam({ region: e.target.value, state: "", district: "", pincode: "" })}>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Source
          <select className={`${inputClass} w-full mt-1`} value={filters.source || "all"} onChange={(e) => setParam({ source: e.target.value === "all" ? "" : e.target.value })}>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          State
          <select className={`${inputClass} w-full mt-1`} value={filters.state} onChange={(e) => setParam({ state: e.target.value, district: "", pincode: "" })}>
            <option value="">All states</option>
            {[...new Set([filters.state, ...options.states].filter(Boolean))].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          District
          <select className={`${inputClass} w-full mt-1`} value={filters.district} onChange={(e) => setParam({ district: e.target.value, pincode: "" })}>
            <option value="">All districts</option>
            {[...new Set([filters.district, ...options.districts].filter(Boolean))].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          PIN code
          <input
            key={filters.pincode}
            className={`${inputClass} w-full mt-1`}
            inputMode="numeric"
            maxLength={6}
            defaultValue={filters.pincode}
            placeholder="6 digits, Enter"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const value = e.currentTarget.value.replace(/\D/g, "");
              if (value === "" || value.length === 6) setParam({ pincode: value });
            }}
          />
        </label>
        <label className="text-xs text-slate-600">
          Category / product
          <div className="flex gap-2 mt-1">
            <select className={`${inputClass} w-1/2`} value={filters.category} onChange={(e) => setParam({ category: e.target.value })}>
              <option value="">All categories</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className={`${inputClass} w-1/2`} value={filters.product} onChange={(e) => setParam({ product: e.target.value })}>
              <option value="">All products</option>
              {options.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {/* Breadcrumb / back navigation */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        {view !== "summary" && (
          <button
            type="button"
            onClick={() => setParam({ view: "" })}
            className="inline-flex items-center gap-1.5 font-medium text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5"
          >
            <FaArrowLeft /> Back to Summary
          </button>
        )}
        {crumbs.map((crumb) => (
          <span key={crumb.label} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 rounded-full px-3 py-1">
            {crumb.label}
            <button type="button" aria-label={`Remove ${crumb.label}`} className="text-slate-500 hover:text-red-600" onClick={() => setParam(crumb.clear)}>
              ×
            </button>
          </span>
        ))}
        {(crumbs.length > 0 || filters.source || searchParams.get("from") || searchParams.get("to")) && (
          <button type="button" className="text-xs text-slate-500 underline" onClick={() => setSearchParams(view === "summary" ? {} : { view })}>
            Clear filters
          </button>
        )}
      </div>

      {notice && <p className="text-sm text-red-600 mb-3">{notice}</p>}

      {view !== "summary" ? (
        <RecordsView filters={filters} view={view} page={page} setParam={setParam} />
      ) : loading ? (
        <p className="text-slate-500">Loading report…</p>
      ) : !report?.success ? (
        <p className="text-red-600">{report?.message || "Unable to load report"}</p>
      ) : (
        <>
          {report.truncated && (
            <p className="text-xs text-amber-700 mb-3">Very large selection: only the latest 50,000 records are included. Narrow the dates.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-3">
            <KpiTile label="Total demand checks" value={totals.checks.toLocaleString("en-IN")} note="All attempts, repeats included" onClick={() => setParam({ view: "records" })} />
            <KpiTile
              label="Unique Visitors (Browser-based)"
              value={totals.uniqueVisitors.toLocaleString("en-IN")}
              note={`${totals.loggedInCustomers} signed in`}
              onClick={() => setParam({ view: "records" })}
            />
            <KpiTile
              label="Customers reaching checkout"
              value={totals.checkoutCustomers.toLocaleString("en-IN")}
              note={`${totals.checkoutAttempts} checkout attempts`}
              onClick={() => setParam({ view: "checkout" })}
            />
            <KpiTile label="Potential cart value" value={rupees(totals.potentialValue)} note={VALUE_BASIS} tone="green" onClick={() => setParam({ view: "carts" })} />
            <KpiTile
              label="Estimated gross margin"
              value={totals.estimatedMargin === null ? <span className="text-lg text-amber-700">Margin Data Incomplete</span> : rupees(totals.estimatedMargin)}
              note={
                totals.estimatedMargin === null
                  ? `${totals.incompleteCarts} cart(s) without product cost. Carts with full cost: ${rupees(totals.completeCartsMargin)} on ${rupees(totals.completeCartsValue)}`
                  : "NOT ACTUAL PROFIT · list-price based, before coupons, bundle discounts, delivery and COD charges"
              }
              tone="amber"
              onClick={() => setParam({ view: "carts" })}
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-6 text-xs">
            <button type="button" onClick={() => setParam({ region: "outside_up", state: "", district: "", pincode: "" })} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-blue-400">
              State restricted: <b>{totals.reasonChecks.not_serviceable}</b> checks
            </button>
            <button type="button" onClick={() => setParam({ region: "unknown", state: "", district: "", pincode: "" })} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-blue-400">
              India Post not verified: <b>{totals.reasonChecks.unverified}</b> checks (kept separate)
            </button>
            {totals.outlierCarts > 0 && (
              <button type="button" onClick={() => setParam({ view: "carts" })} className="bg-white border border-red-200 text-red-700 rounded-lg px-3 py-1.5 hover:border-red-400">
                Outlier carts (not in totals): <b>{totals.outlierCarts}</b> · {rupees(totals.outlierValue)}
              </button>
            )}
            {totals.limitedGuestAttempts > 0 && (
              <span className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600">
                Guest checks over the daily per-network limit (not counted): <b>{totals.limitedGuestAttempts}</b>
              </span>
            )}
            {totals.reasonChecks.ambiguous > 0 && (
              <button type="button" onClick={() => setParam({ region: "unknown", state: "", district: "", pincode: "" })} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-blue-400">
                PIN in several states: <b>{totals.reasonChecks.ambiguous}</b>
              </button>
            )}
          </div>

          <DemandTable
            title="State-wise demand"
            rows={report.byState}
            csvTable="state"
            onCsv={onCsv}
            onRowClick={(row) => setParam({ state: row.state, district: "", pincode: "" })}
            columns={[{ label: "State", key: "state" }, ...metricColumns]}
          />
          <DemandTable
            title="District-wise demand"
            rows={report.byDistrict}
            csvTable="district"
            onCsv={onCsv}
            onRowClick={(row) => setParam({ state: row.state, district: row.district, pincode: "" })}
            columns={[{ label: "State", key: "state" }, { label: "District", key: "district" }, ...metricColumns]}
          />
          <DemandTable
            title="PIN code-wise demand"
            rows={report.byPincode}
            csvTable="pincode"
            onCsv={onCsv}
            onRowClick={(row) => setParam({ pincode: row.pincode, view: "records" })}
            columns={[{ label: "PIN code", key: "pincode" }, { label: "State", key: "state" }, { label: "District", key: "district" }, ...metricColumns]}
          />
          <DemandTable
            title="Product-wise demand"
            rows={report.byProduct}
            csvTable="product"
            onCsv={onCsv}
            onRowClick={(row) => setParam({ product: row.productId, view: "records" })}
            columns={[
              { label: "Product", key: "product" },
              { label: "Category", key: "category" },
              { label: "Unique customers", key: "uniqueVisitors", align: "right" },
              { label: "Demand attempts", key: "checks", align: "right" },
              { label: "Qty in carts", key: "quantity", align: "right" },
              { label: "Potential value", align: "right", render: (row) => rupees(row.potentialValue) },
              { label: "Est. margin", align: "right", render: (row) => <MarginCell value={row.estimatedMargin} /> },
            ]}
          />
          <DemandTable
            title="Customers who reached checkout (signed in, with a cart)"
            rows={report.checkoutCustomers}
            onRowClick={(row) => setParam({ pincode: row.pincode, view: "carts" })}
            emptyText="No signed-in customer reached checkout in this selection."
            columns={[
              {
                label: "Customer",
                render: (row) => (
                  <Link to={`/admin/customers/${row.userId}`} onClick={(e) => e.stopPropagation()} className="text-blue-700 hover:underline">
                    {row.name}
                  </Link>
                ),
              },
              { label: "Phone", key: "mobile" },
              { label: "PIN", render: (row) => `${row.pincode} · ${[row.district, row.state].filter(Boolean).join(", ")}` },
              { label: "Cart", render: (row) => row.items.map((item) => `${item.name}${item.size ? ` (${item.size})` : ""} × ${item.quantity}`).join(", ") },
              {
                label: "Cart value",
                align: "right",
                render: (row) => (
                  <span>
                    {rupees(row.cartValue)}
                    {row.outlier && <span className="block text-[11px] text-red-700 font-semibold">Outlier – not in totals</span>}
                  </span>
                ),
              },
              { label: "Est. margin", align: "right", render: (row) => <MarginCell value={row.estimatedMargin} /> },
              { label: "Last attempt", render: (row) => dateTime(row.lastAt) },
            ]}
          />
          <p className="text-xs text-slate-500">
            Unique visitors are browser-based: one browser or signed-in account = one visitor (the same person on two browsers, or
            before and after signing in, counts twice). At most 5 new guest browsers per network per day are counted. Potential
            value uses each checkout customer&apos;s latest cart once; carts over 20 lines, 10 units on a line or ₹50,000 are
            outliers and shown separately. {VALUE_BASIS} With a product or category filter only matching cart lines count. Estimated margin uses the product&apos;s recorded
            purchase price plus misc. expenses; any line without a purchase price shows &quot;Margin Data Incomplete&quot;.
            Records are deleted automatically after 365 days.
          </p>
        </>
      )}
    </div>
  );
}

export default AdminDeliveryDemand;
