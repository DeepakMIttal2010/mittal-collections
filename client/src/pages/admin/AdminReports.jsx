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
  FaExclamationTriangle,
  FaCoins,
  FaWallet,
  FaHourglassEnd,
  FaGift,
} from "react-icons/fa";

import {
  getReportsData,
  getGoogleReportsData,
  getProductEngagement,
  getProductWishlistUsers,
  getProductCartUsers,
  getProductViewUsers,
  getEngagementDetails,
  getAbandonedCartDetails,
} from "../../services/adminService";

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

function ConversionFunnel({ funnel }) {
  const stages = [
    { label: "Website Visitors", value: funnel.visitors },
    { label: "Viewed a Product", value: funnel.productViewers },
    { label: "Viewed Cart", value: funnel.cartViewers },
    { label: "Reached Checkout", value: funnel.checkoutViewers },
    { label: "Placed an Order", value: funnel.ordersPlaced },
  ];

  const max = Math.max(stages[0].value, 1);

  if (funnel.visitors === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        No visits recorded in this range yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, index) => {
        const widthPct = Math.max((stage.value / max) * 100, 2);
        const prevValue = index > 0 ? stages[index - 1].value : null;
        const dropOffPct =
          prevValue && prevValue > 0
            ? (((prevValue - stage.value) / prevValue) * 100).toFixed(0)
            : null;

        return (
          <div key={stage.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-slate-700">
                {stage.label}
              </span>
              <span className="text-slate-500">
                {stage.value.toLocaleString("en-IN")}
                {dropOffPct !== null && Number(dropOffPct) > 0 && (
                  <span className="text-red-500 ml-2 text-xs">
                    −{dropOffPct}%
                  </span>
                )}
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}

      <p className="text-xs text-slate-400 mt-1">
        Based on anonymous visitor tracking — visits aren&apos;t linked to
        accounts, so this approximates the journey rather than tracing
        individual customers.
      </p>
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

// Views/wishlist/cart are all-time and current-state respectively, not
// scoped to the page's date-range picker — see the loadEngagement effect
// in AdminReports. Sorted by views (already sorted server-side); a search
// box lets the admin jump straight to one product instead of scrolling a
// full catalog.
// Wishlist has a precise per-item add date; a cart snapshot only tracks one
// updatedAt for the whole cart, not per line item (see
// getProductCartUsers), so that one is "last synced" not "added on"; a
// product view has no per-user record at all unless they were logged in
// (see getProductViewUsers) — the modal for that type shows a note
// explaining the gap rather than implying it's the full viewer list.
const USER_MODAL_CONFIG = {
  wishlist: {
    title: "Wishlisted by",
    dateLabel: "Added on",
    dateKey: "addedAt",
    fetch: getProductWishlistUsers,
  },
  cart: {
    title: "Currently in cart of",
    dateLabel: "Last synced",
    dateKey: "lastSyncedAt",
    fetch: getProductCartUsers,
  },
  views: {
    title: "Viewed by (logged-in only)",
    dateLabel: "Last viewed",
    dateKey: "lastViewedAt",
    fetch: getProductViewUsers,
  },
};

// Drill-down for the "Cart Abandonment" stat — every currently-abandoned
// cart (same 3-hour cutoff, live-snapshot nature as the stat itself),
// what's in it, and whether a reminder's already gone out.
function AbandonedCartsModal({ onClose }) {
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const response = await getAbandonedCartDetails();

      if (response.success) setCarts(response.carts);

      setLoading(false);
    };

    load();
  }, []);

  const exportCartsCSV = () => {
    const csv = Papa.unparse(
      carts.map((c) => ({
        Name: c.name || "",
        Mobile: c.mobile || "",
        Email: c.email || "",
        Items: c.items.map((i) => `${i.name} x${i.quantity}`).join("; "),
        "Value (₹)": c.value,
        "Abandoned Since": c.abandonedSince
          ? new Date(c.abandonedSince).toLocaleString("en-IN")
          : "",
        "Reminder Sent": c.reminderSent ? "Yes" : "No",
      })),
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "abandoned-carts.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h3 className="font-bold text-slate-900">Abandoned Carts</h3>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {carts.length > 0 && (
              <button
                type="button"
                onClick={exportCartsCSV}
                className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
              >
                Export CSV
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : carts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No abandoned carts right now.
            </p>
          ) : (
            <div className="space-y-3">
              {carts.map((cart, i) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {cart.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[cart.mobile, cart.email].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-800">
                        {formatCurrency(cart.value)}
                      </p>
                      {cart.reminderSent && (
                        <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                          Reminder sent
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {cart.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Abandoned since{" "}
                    {new Date(cart.abandonedSince).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductUsersModal({ productId, productName, type, totalUniqueViewers, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const { title, dateLabel, dateKey, fetch: fetchUsers } = USER_MODAL_CONFIG[type];

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const response = await fetchUsers(productId);

      if (response.success) setUsers(response.users);

      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, type]);

  const exportUsersCSV = () => {
    const csv = Papa.unparse(
      users.map((u) => ({
        Name: u.name || "",
        Mobile: u.mobile || "",
        Email: u.email || "",
        [dateLabel]: u[dateKey]
          ? new Date(u[dateKey]).toLocaleDateString("en-IN")
          : "",
      })),
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${productName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${type}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 truncate">{productName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {users.length > 0 && (
              <button
                type="button"
                onClick={exportUsersCSV}
                className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
              >
                Export CSV
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {type === "views" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Only shows viewers who were logged in at the time — most
              visits are anonymous.{" "}
              {typeof totalUniqueViewers === "number" && (
                <>Total unique viewers (including guests): {totalUniqueViewers}.</>
              )}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No one right now.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2 font-medium">Name</th>
                  <th className="py-2 px-2 font-medium">Mobile</th>
                  <th className="py-2 px-2 font-medium">Email</th>
                  <th className="py-2 pl-2 font-medium">{dateLabel}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2 pr-2 text-slate-700 whitespace-nowrap">
                      {u.name || "—"}
                    </td>
                    <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                      {u.mobile || "—"}
                    </td>
                    <td className="py-2 px-2 text-slate-600 truncate max-w-[140px]">
                      {u.email || "—"}
                    </td>
                    <td className="py-2 pl-2 text-slate-600 whitespace-nowrap">
                      {u[dateKey]
                        ? new Date(u[dateKey]).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const ENGAGEMENT_SORT_KEYS = {
  name: (item) => item.name.toLowerCase(),
  views: (item) => item.views,
  wishlistCount: (item) => item.wishlistCount,
  cartCount: (item) => item.cartCount,
};

function SortHeader({ label, sortKey, activeKey, dir, onSort, align = "right" }) {
  const isActive = sortKey === activeKey;

  return (
    <th
      className={`py-2 px-2 font-medium select-none cursor-pointer hover:text-slate-700 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className={`inline-block w-3 ${isActive ? "text-slate-700" : "text-slate-300"}`}>
        {isActive ? (dir === "asc" ? "▲" : "▼") : "▼"}
      </span>
    </th>
  );
}

function ProductEngagementTable({ items, loading, onSelectUsers }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("views");
  const [sortDir, setSortDir] = useState("desc");

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const filtered = query.trim()
    ? items.filter((item) =>
        item.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;

  const getSortValue = ENGAGEMENT_SORT_KEYS[sortKey] || ENGAGEMENT_SORT_KEYS.views;
  const sorted = [...filtered].sort((a, b) => {
    const av = getSortValue(a);
    const bv = getSortValue(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a product..."
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-sm text-slate-400 py-8 text-center">Loading...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">
          {items.length === 0 ? "No product activity recorded yet." : "No matching product."}
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <SortHeader
                  label="Product"
                  sortKey="name"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="left"
                />
                <SortHeader
                  label="Views"
                  sortKey="views"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Wishlisted"
                  sortKey="wishlistCount"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="In Cart"
                  sortKey="cartCount"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr
                  key={item.productId}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="py-2 pr-2 text-slate-700 truncate max-w-xs">
                    {item.name}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600">
                    {item.views > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectUsers(
                            item.productId,
                            item.name,
                            "views",
                            item.uniqueViewers,
                          )
                        }
                        className="text-blue-700 hover:underline"
                      >
                        {formatNumber(item.views)}
                      </button>
                    ) : (
                      "0"
                    )}
                    {item.uniqueViewers > 0 && (
                      <span className="text-slate-400">
                        {" "}
                        ({formatNumber(item.uniqueViewers)} people)
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {item.wishlistCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectUsers(item.productId, item.name, "wishlist")
                        }
                        className="text-blue-700 hover:underline"
                      >
                        {formatNumber(item.wishlistCount)}
                      </button>
                    ) : (
                      <span className="text-slate-600">0</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 text-right">
                    {item.cartCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectUsers(item.productId, item.name, "cart")
                        }
                        className="text-blue-700 hover:underline"
                      >
                        {formatNumber(item.cartCount)}
                      </button>
                    ) : (
                      <span className="text-slate-600">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    funnel: {
      visitors: 0,
      productViewers: 0,
      cartViewers: 0,
      checkoutViewers: 0,
      ordersPlaced: 0,
    },
    search: { totalSearches: 0, topSearches: [], zeroResultSearches: [] },
    cartAbandonment: {
      abandonedCount: 0,
      abandonedValue: 0,
      reminderSentAwaitingRecovery: 0,
    },
    loyalty: {
      pointsEarned: 0,
      pointsRedeemed: 0,
      pointsExpired: 0,
      redemptionRate: null,
      referralSignups: 0,
      referralConversions: 0,
      referralPointsPaid: 0,
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

  const [googleReport, setGoogleReport] = useState(null);
  const [googleReportUnavailable, setGoogleReportUnavailable] =
    useState(false);
  const [googleLoading, setGoogleLoading] = useState(true);

  // Current-state numbers (how many people have this in their wishlist /
  // cart right now, all-time view count) — not scoped to the days/custom
  // date range the rest of this page filters by, so loaded once rather
  // than re-fetched on every range change.
  const [engagement, setEngagement] = useState([]);
  const [engagementLoading, setEngagementLoading] = useState(true);
  const [usersModal, setUsersModal] = useState(null); // { productId, productName, type } | null
  const [showAbandonedCarts, setShowAbandonedCarts] = useState(false);

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

  const loadGoogleReport = async () => {
    setGoogleLoading(true);

    const response = await getGoogleReportsData(days);

    if (response.success) {
      setGoogleReport(response);
      setGoogleReportUnavailable(false);
    } else {
      setGoogleReportUnavailable(true);
    }

    setGoogleLoading(false);
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, customRange]);

  useEffect(() => {
    // Google Analytics / Search Console only support the preset day
    // ranges here, not the arbitrary custom date picker below.
    if (customRange) return;
    loadGoogleReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, customRange]);

  useEffect(() => {
    const loadEngagement = async () => {
      setEngagementLoading(true);

      const response = await getProductEngagement();

      if (response.success) setEngagement(response.engagement);

      setEngagementLoading(false);
    };

    loadEngagement();
  }, []);

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

  const [exporting, setExporting] = useState(false);

  const exportCSV = async () => {
    setExporting(true);
    const [detailsResponse, abandonedCartsResponse] = await Promise.all([
      getEngagementDetails(),
      getAbandonedCartDetails(),
    ]);
    setExporting(false);

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
          "Currently Abandoned Carts": report.cartAbandonment.abandonedCount,
          "Abandoned Cart Value": report.cartAbandonment.abandonedValue,
        },
      ]),
    );

    const section = (title, rows, mapRow) => {
      if (!rows || rows.length === 0) return;
      blocks.push("");
      blocks.push(title);
      blocks.push(Papa.unparse(rows.map(mapRow)));
    };

    section(
      "Conversion Funnel",
      [
        { stage: "Website Visitors", value: report.funnel.visitors },
        { stage: "Viewed a Product", value: report.funnel.productViewers },
        { stage: "Viewed Cart", value: report.funnel.cartViewers },
        { stage: "Reached Checkout", value: report.funnel.checkoutViewers },
        { stage: "Placed an Order", value: report.funnel.ordersPlaced },
      ],
      (s) => ({ Stage: s.stage, Count: s.value }),
    );

    blocks.push("");
    blocks.push("Loyalty & Referral Performance");
    blocks.push(
      Papa.unparse([
        {
          "Points Earned": report.loyalty.pointsEarned,
          "Points Redeemed": report.loyalty.pointsRedeemed,
          "Redemption Rate %":
            report.loyalty.redemptionRate?.toFixed(1) ?? "",
          "Points Expired": report.loyalty.pointsExpired,
          "Referral Signups": report.loyalty.referralSignups,
          "Referral Conversions": report.loyalty.referralConversions,
          "Referral Points Paid Out": report.loyalty.referralPointsPaid,
        },
      ]),
    );

    section("Top Search Queries", report.search.topSearches, (s) => ({
      Query: s.query,
      Searches: s.count,
      "Avg Results": s.avgResults,
    }));
    section(
      "Zero-Result Searches",
      report.search.zeroResultSearches,
      (s) => ({ Query: s.query, Searches: s.count }),
    );

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
    // Product Engagement isn't scoped to the days/custom range the rest
    // of this export is (see loadEngagement's own comment) — included
    // here anyway since this is the one export button on the page, and
    // "current status, not just this range" is noted right in the row.
    section("Product Engagement (current status, all-time views)", engagement, (e) => ({
      Product: e.name,
      Views: e.views,
      "Unique Viewers": e.uniqueViewers,
      Wishlisted: e.wishlistCount,
      "In Cart": e.cartCount,
    }));
    // Every wishlist/cart row, not just counts — matches what each
    // product's own drill-down modal shows, just all in one place.
    section(
      "Wishlist & Cart Details",
      detailsResponse.success ? detailsResponse.rows : [],
      (r) => ({
        Product: r.product,
        Type: r.type,
        Name: r.name,
        Mobile: r.mobile,
        Email: r.email,
        Date: r.date ? new Date(r.date).toLocaleDateString("en-IN") : "",
      }),
    );
    section(
      "Abandoned Carts (current status)",
      abandonedCartsResponse.success ? abandonedCartsResponse.carts : [],
      (c) => ({
        Name: c.name,
        Mobile: c.mobile,
        Email: c.email,
        Items: c.items.map((i) => `${i.name} x${i.quantity}`).join("; "),
        "Value (₹)": c.value,
        "Abandoned Since": c.abandonedSince
          ? new Date(c.abandonedSince).toLocaleString("en-IN")
          : "",
        "Reminder Sent": c.reminderSent ? "Yes" : "No",
      }),
    );
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
            disabled={exporting}
            className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            <FaDownload className="text-xs" />
            {exporting ? "Preparing..." : "Export CSV"}
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

      <div className="bg-white border border-amber-200 bg-amber-50/40 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <FaExclamationTriangle className="text-amber-500" />
            Cart Abandonment — right now
          </h3>
          {report.cartAbandonment.abandonedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAbandonedCarts(true)}
              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
            >
              View Details
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          A live snapshot, not scoped to the date range above — an
          abandoned cart is cleared the moment it turns into an order, so
          there's no historical trail to filter by date.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-slate-800">
              {formatNumber(report.cartAbandonment.abandonedCount)}
            </p>
            <p className="text-sm text-slate-500">
              Carts abandoned (3+ hrs inactive)
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">
              {formatCurrency(report.cartAbandonment.abandonedValue)}
            </p>
            <p className="text-sm text-slate-500">Total value at stake</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">
              {formatNumber(
                report.cartAbandonment.reminderSentAwaitingRecovery,
              )}
            </p>
            <p className="text-sm text-slate-500">
              Reminder sent, not yet recovered
            </p>
          </div>
        </div>
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

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-slate-800 mb-4">
          Conversion Funnel — {rangeLabel}
        </h3>
        <ConversionFunnel funnel={report.funnel} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-1">
            Top Search Queries — Your Site's Search Box — {rangeLabel}
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            {formatNumber(report.search.totalSearches)} total searches typed
            into your site's own search box (not Google)
          </p>
          {report.search.topSearches.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No searches recorded in this range yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {report.search.topSearches.map((s) => (
                <div
                  key={s.query}
                  className="flex items-center justify-between text-sm border-b border-slate-50 pb-2"
                >
                  <span className="font-medium text-slate-700">
                    {s.query}
                  </span>
                  <span className="text-slate-500">
                    {s.count} searches · {s.avgResults} avg results
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-1">
            Zero-Result Searches — {rangeLabel}
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Searches where customers found nothing — potential missing
            products or search gaps.
          </p>
          {report.search.zeroResultSearches.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No zero-result searches in this range. 🎉
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {report.search.zeroResultSearches.map((s) => (
                <div
                  key={s.query}
                  className="flex items-center justify-between text-sm border-b border-slate-50 pb-2"
                >
                  <span className="font-medium text-red-700">{s.query}</span>
                  <span className="text-slate-500">{s.count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-slate-800 mb-1">
          Google Analytics & Search Console — {rangeLabel}
        </h3>
        <p className="text-xs text-slate-400 mb-1">
          Live data pulled directly from Google — separate from this
          site's own tracking above.
        </p>
        {customRange ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            Select a preset range (7 / 30 / 90 days) above to see Google
            data — the custom date picker isn't supported here yet.
          </p>
        ) : googleLoading ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            Loading Google data…
          </p>
        ) : googleReportUnavailable ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            Google Analytics / Search Console data isn't available right
            now — check that the server's Google service account is
            configured correctly.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-3">
                Analytics
              </p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-400">Active Users</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatNumber(googleReport.analytics.activeUsers)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Sessions</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatNumber(googleReport.analytics.sessions)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Page Views</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatNumber(googleReport.analytics.pageViews)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Engagement Rate</p>
                  <p className="text-xl font-bold text-slate-800">
                    {googleReport.analytics.engagementRate.toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                Top Pages (Google Analytics)
              </p>
              <RankedBarList
                items={googleReport.analytics.topPages}
                labelKey="path"
                valueKey="views"
                formatValue={(v) => `${formatNumber(v)} views`}
                emptyText="No page view data yet."
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-3">
                Search Console
              </p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-400">Clicks</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatNumber(googleReport.searchConsole.clicks)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Impressions</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatNumber(googleReport.searchConsole.impressions)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">CTR</p>
                  <p className="text-xl font-bold text-slate-800">
                    {googleReport.searchConsole.ctr.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Avg Position</p>
                  <p className="text-xl font-bold text-slate-800">
                    {googleReport.searchConsole.avgPosition.toFixed(1)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                Top Search Queries (Google)
              </p>
              <RankedBarList
                items={googleReport.searchConsole.topQueries}
                labelKey="query"
                valueKey="clicks"
                formatValue={(v) => `${formatNumber(v)} clicks`}
                emptyText="No search query data yet."
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-4">
            Orders by Status
          </h3>
          <OrdersByStatus data={report.ordersByStatus} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-1">
            Most Visited Pages — Your Site's Tracking — {rangeLabel}
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            From this site's own visit tracking (not Google Analytics)
          </p>
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
        <h3 className="font-semibold text-slate-800 mb-1">
          Product Engagement — current status
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Views are all-time; wishlist/cart counts are how many people have
          it right now, not a historical total. Cart count only covers
          logged-in customers.
        </p>
        <ProductEngagementTable
          items={engagement}
          loading={engagementLoading}
          onSelectUsers={(productId, productName, type, totalUniqueViewers) =>
            setUsersModal({ productId, productName, type, totalUniqueViewers })
          }
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-slate-800 mb-1">
          Loyalty & Referral Performance — {rangeLabel}
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Redemption rate compares points earned and redeemed within this
          range — since points can be earned in one period and redeemed in
          another, treat it as a rough signal, not an exact cohort rate.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon={<FaCoins />}
            label="Points Earned"
            value={formatNumber(report.loyalty.pointsEarned)}
          />
          <StatTile
            icon={<FaWallet />}
            label="Points Redeemed"
            value={
              report.loyalty.redemptionRate === null
                ? formatNumber(report.loyalty.pointsRedeemed)
                : `${formatNumber(report.loyalty.pointsRedeemed)} (${report.loyalty.redemptionRate.toFixed(0)}%)`
            }
          />
          <StatTile
            icon={<FaHourglassEnd />}
            label="Points Expired"
            value={formatNumber(report.loyalty.pointsExpired)}
          />
          <StatTile
            icon={<FaGift />}
            label="Referral Bonus Paid"
            value={formatNumber(report.loyalty.referralPointsPaid)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <StatTile
            icon={<FaUserPlus />}
            label={`Referral Signups — ${rangeLabel}`}
            value={formatNumber(report.loyalty.referralSignups)}
          />
          <StatTile
            icon={<FaUserCheck />}
            label={`Referral Conversions — ${rangeLabel}`}
            value={formatNumber(report.loyalty.referralConversions)}
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

      {usersModal && (
        <ProductUsersModal
          productId={usersModal.productId}
          productName={usersModal.productName}
          type={usersModal.type}
          totalUniqueViewers={usersModal.totalUniqueViewers}
          onClose={() => setUsersModal(null)}
        />
      )}

      {showAbandonedCarts && (
        <AbandonedCartsModal onClose={() => setShowAbandonedCarts(false)} />
      )}
    </div>
  );
}

export default AdminReports;
