import { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  FaRupeeSign,
  FaShoppingCart,
  FaChartLine,
  FaUsers,
  FaEye,
  FaUserFriends,
  FaUserPlus,
  FaUserCheck,
  FaArrowUp,
  FaArrowDown,
  FaDownload,
} from "react-icons/fa";

import { getReportsData } from "../../services/adminService";

const RANGE_OPTIONS = [7, 30, 90];

const STATUS_COLORS = {
  Pending: "#F59E0B",
  Processing: "#8B5CF6",
  Shipped: "#06B6D4",
  Delivered: "#22C55E",
  Cancelled: "#EF4444",
};

const formatCurrency = (value) =>
  `₹${Math.round(value).toLocaleString("en-IN")}`;

const formatNumber = (value) => Math.round(value).toLocaleString("en-IN");

const formatDay = (isoDate) => {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function GrowthBadge({ percent }) {
  if (percent === null || percent === undefined) {
    return <span className="text-xs text-slate-400">vs previous period —</span>;
  }

  const isUp = percent >= 0;
  const Icon = isUp ? FaArrowUp : FaArrowDown;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        isUp ? "text-green-600" : "text-red-600"
      }`}
    >
      <Icon className="text-[10px]" />
      {Math.abs(percent).toFixed(1)}% vs previous period
    </span>
  );
}

function StatTile({ icon, label, value, growth }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 leading-tight">
          {value}
        </p>
        <p className="text-sm text-slate-500">{label}</p>
        {growth !== undefined && (
          <div className="mt-0.5">
            <GrowthBadge percent={growth} />
          </div>
        )}
      </div>
    </div>
  );
}

function BarTrendChart({ data, valueKey, formatValue, emptyText }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-12 text-center">{emptyText}</p>
    );
  }

  const max = Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <div className="flex items-end gap-1.5 h-48">
      {data.map((d) => {
        const heightPct = Math.max((d[valueKey] / max) * 100, 3);
        return (
          <div
            key={d._id}
            className="group relative flex-1 flex flex-col items-center justify-end h-full"
          >
            <div className="absolute -top-9 hidden group-hover:flex flex-col items-center bg-slate-800 text-white text-xs rounded-md px-2 py-1 whitespace-nowrap z-10">
              <span className="font-semibold">
                {formatValue(d[valueKey])}
              </span>
              <span className="text-slate-300">{formatDay(d._id)}</span>
            </div>
            <div
              className="w-full rounded-t-sm bg-blue-600 group-hover:bg-blue-700 transition-colors"
              style={{ height: `${heightPct}%` }}
            />
            {data.length <= 14 && (
              <span className="text-[10px] text-slate-400 mt-1.5 whitespace-nowrap">
                {formatDay(d._id)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrdersByStatus({ data }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        No orders yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => {
        const pct = (d.count / total) * 100;
        const color = STATUS_COLORS[d._id] || "#94A3B8";
        return (
          <div key={d._id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-slate-700">{d._id}</span>
              <span className="text-slate-500">{d.count}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankedBarList({ items, labelKey, valueKey, formatValue, emptyText }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">{emptyText}</p>
    );
  }

  const max = Math.max(...items.map((i) => i[valueKey]), 1);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div key={item._id || index}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium text-slate-700 truncate pr-2">
              {item[labelKey]}
            </span>
            <span className="text-slate-500 shrink-0">
              {formatValue(item[valueKey])}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${(item[valueKey] / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [customRange, setCustomRange] = useState(null); // { startDate, endDate } | null
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState(todayISO());

  const [report, setReport] = useState({
    summary: {
      totalRevenue: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      totalCustomers: 0,
      totalVisits: 0,
      uniqueVisitors: 0,
      newVisitors: 0,
      returningVisitors: 0,
    },
    growth: { revenue: null, orders: null },
    salesOverTime: [],
    ordersByStatus: [],
    topProducts: [],
    revenueByCategory: [],
    visitsOverTime: [],
    topPages: [],
    deviceBreakdown: [],
    locationBreakdown: [],
  });

  const loadReport = async () => {
    setLoading(true);

    const response = await getReportsData(
      customRange ? customRange : { days },
    );

    if (response.success) {
      setReport(response);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, customRange]);

  const rangeLabel = customRange
    ? `${new Date(customRange.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(customRange.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
    : `last ${days} days`;

  const applyCustomRange = () => {
    if (!draftStart || !draftEnd) return;
    setCustomRange({ startDate: draftStart, endDate: draftEnd });
    setShowCustomPicker(false);
  };

  const selectPreset = (opt) => {
    setCustomRange(null);
    setDays(opt);
    setShowCustomPicker(false);
  };

  const exportCSV = () => {
    const { summary } = report;
    const blocks = [];

    blocks.push(`Mittal Collections Report — ${rangeLabel}`);
    blocks.push("");

    blocks.push("Summary");
    blocks.push(
      Papa.unparse([
        {
          "Total Revenue": summary.totalRevenue,
          "Total Orders": summary.totalOrders,
          "Avg Order Value": summary.avgOrderValue.toFixed(2),
          "Total Customers (all-time)": summary.totalCustomers,
          "Website Visits": summary.totalVisits,
          "Unique Visitors": summary.uniqueVisitors,
          "New Visitors": summary.newVisitors,
          "Returning Visitors": summary.returningVisitors,
          "Revenue Growth %": report.growth?.revenue?.toFixed(1) ?? "",
          "Orders Growth %": report.growth?.orders?.toFixed(1) ?? "",
        },
      ]),
    );

    const section = (title, rows, mapRow) => {
      if (!rows || rows.length === 0) return;
      blocks.push("");
      blocks.push(title);
      blocks.push(Papa.unparse(rows.map(mapRow)));
    };

    section("Sales Over Time", report.salesOverTime, (d) => ({
      Date: d._id,
      Revenue: d.revenue,
      Orders: d.orders,
    }));
    section("Top Selling Products", report.topProducts, (p) => ({
      Product: p.name,
      "Units Sold": p.unitsSold,
      Revenue: p.revenue,
    }));
    section("Revenue by Category", report.revenueByCategory, (c) => ({
      Category: c.name,
      Revenue: c.revenue,
    }));
    section("Orders by Status", report.ordersByStatus, (s) => ({
      Status: s._id,
      Count: s.count,
    }));
    section("Most Visited Pages", report.topPages, (p) => ({
      Page: p._id,
      Visits: p.visits,
    }));
    section("Visits by Device", report.deviceBreakdown, (d) => ({
      Device: d._id,
      Visits: d.count,
    }));
    section("Visitor Locations", report.locationBreakdown, (l) => ({
      City: l.city,
      State: l.region,
      Country: l.country,
      Visits: l.visits,
      "Unique Visitors": l.uniqueVisitors,
    }));

    const blob = new Blob([blocks.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const rangeSlug = customRange
      ? `${customRange.startDate}_to_${customRange.endDate}`
      : `last-${days}-days`;

    const link = document.createElement("a");
    link.href = url;
    link.download = `mittal-collections-report-${rangeSlug}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading Reports...</div>
    );
  }

  const { summary } = report;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Reports</h2>
          <p className="text-sm text-slate-500">
            Sales and traffic overview
          </p>
        </div>

        <div className="relative flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => selectPreset(opt)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !customRange && days === opt
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {opt} days
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustomPicker((v) => !v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                customRange
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {customRange ? rangeLabel : "Custom"}
            </button>
          </div>

          {showCustomPicker && (
            <div className="absolute right-0 top-full mt-2 z-10 bg-white border border-slate-200 rounded-lg shadow-lg p-4 flex items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={draftStart}
                  max={draftEnd}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={draftEnd}
                  max={todayISO()}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={applyCustomRange}
                disabled={!draftStart || !draftEnd}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <FaDownload className="text-xs" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatTile
          icon={<FaRupeeSign />}
          label={`Revenue — ${rangeLabel}`}
          value={formatCurrency(summary.totalRevenue)}
          growth={report.growth?.revenue}
        />
        <StatTile
          icon={<FaShoppingCart />}
          label={`Orders — ${rangeLabel}`}
          value={summary.totalOrders}
          growth={report.growth?.orders}
        />
        <StatTile
          icon={<FaChartLine />}
          label="Avg. Order Value"
          value={formatCurrency(summary.avgOrderValue)}
        />
        <StatTile
          icon={<FaUsers />}
          label="Total Customers (all-time)"
          value={summary.totalCustomers}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          icon={<FaEye />}
          label={`Website Visits — ${rangeLabel}`}
          value={formatNumber(summary.totalVisits)}
        />
        <StatTile
          icon={<FaUserFriends />}
          label={`Unique Visitors — ${rangeLabel}`}
          value={formatNumber(summary.uniqueVisitors)}
        />
        <StatTile
          icon={<FaUserPlus />}
          label={`New Visitors — ${rangeLabel}`}
          value={formatNumber(summary.newVisitors)}
        />
        <StatTile
          icon={<FaUserCheck />}
          label={`Returning Visitors — ${rangeLabel}`}
          value={formatNumber(summary.returningVisitors)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Sales — {rangeLabel}
          </h3>
          <BarTrendChart
            data={report.salesOverTime}
            valueKey="revenue"
            formatValue={formatCurrency}
            emptyText="No sales in this range yet."
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Website Visits — {rangeLabel}
          </h3>
          <BarTrendChart
            data={report.visitsOverTime}
            valueKey="visits"
            formatValue={(v) => `${formatNumber(v)} visits`}
            emptyText="No visits recorded in this range yet."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Orders by Status
          </h3>
          <OrdersByStatus data={report.ordersByStatus} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Most Visited Pages — {rangeLabel}
          </h3>
          <RankedBarList
            items={report.topPages}
            labelKey="_id"
            valueKey="visits"
            formatValue={(v) => `${formatNumber(v)} visits`}
            emptyText="No page visits recorded in this range yet."
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Visits by Device — {rangeLabel}
          </h3>
          <RankedBarList
            items={report.deviceBreakdown}
            labelKey="_id"
            valueKey="count"
            formatValue={(v) => `${formatNumber(v)} visits`}
            emptyText="No visits recorded in this range yet."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Top Selling Products
          </h3>
          <RankedBarList
            items={report.topProducts}
            labelKey="name"
            valueKey="revenue"
            formatValue={formatCurrency}
            emptyText="No product sales yet."
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Revenue by Category
          </h3>
          <RankedBarList
            items={report.revenueByCategory}
            labelKey="name"
            valueKey="revenue"
            formatValue={formatCurrency}
            emptyText="No category sales yet."
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-slate-800 mb-4">
          Visitor Locations — {rangeLabel}
        </h3>

        {report.locationBreakdown.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            No visits recorded in this range yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    City
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    State
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    Country
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Visits
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Unique Visitors
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.locationBreakdown.map((loc, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2.5 text-slate-700">{loc.city}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {loc.region}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {loc.country}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {formatNumber(loc.visits)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {formatNumber(loc.uniqueVisitors)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminReports;
