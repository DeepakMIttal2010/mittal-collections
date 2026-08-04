import { useEffect, useState } from "react";
import {
  FaRupeeSign,
  FaShoppingCart,
  FaChartLine,
  FaUsers,
  FaEye,
  FaUserFriends,
  FaUserPlus,
  FaUserCheck,
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

function StatTile({ icon, label, value }) {
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

function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
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

    const response = await getReportsData(days);

    if (response.success) {
      setReport(response);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

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

        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setDays(opt)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                days === opt
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {opt} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatTile
          icon={<FaRupeeSign />}
          label="Total Revenue"
          value={formatCurrency(summary.totalRevenue)}
        />
        <StatTile
          icon={<FaShoppingCart />}
          label="Total Orders"
          value={summary.totalOrders}
        />
        <StatTile
          icon={<FaChartLine />}
          label="Avg. Order Value"
          value={formatCurrency(summary.avgOrderValue)}
        />
        <StatTile
          icon={<FaUsers />}
          label="Total Customers"
          value={summary.totalCustomers}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          icon={<FaEye />}
          label="Total Website Visits (all-time)"
          value={formatNumber(summary.totalVisits)}
        />
        <StatTile
          icon={<FaUserFriends />}
          label="Unique Visitors (all-time)"
          value={formatNumber(summary.uniqueVisitors)}
        />
        <StatTile
          icon={<FaUserPlus />}
          label={`New Visitors — last ${days} days`}
          value={formatNumber(summary.newVisitors)}
        />
        <StatTile
          icon={<FaUserCheck />}
          label={`Returning Visitors — last ${days} days`}
          value={formatNumber(summary.returningVisitors)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Sales — last {days} days
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
            Website Visits — last {days} days
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
            Most Visited Pages — last {days} days
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
            Visits by Device — last {days} days
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
          Visitor Locations — last {days} days
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
