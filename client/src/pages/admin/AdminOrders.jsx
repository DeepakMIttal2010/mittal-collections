import { imgUrl } from "../../services/api";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaSortAmountDown, FaSortAmountUp, FaWhatsapp } from "react-icons/fa";

import {
  getAllOrders,
  updateOrderStatus,
  restoreOrder,
  deleteOrder,
  permanentlyDeleteOrder,
} from "../../services/adminOrderService";

const STATUS_OPTIONS = [
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

const STATUS_COLORS = {
  Pending: "bg-slate-100 text-slate-700",
  Processing: "bg-blue-100 text-blue-700",
  Shipped: "bg-amber-100 text-amber-700",
  Delivered: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

// Manual stand-in for the automated WhatsApp notifications planned
// eventually (blocked on Meta Business Verification, which needs a
// business-name-matching document we don't have yet) — a plain wa.me
// deep link needs no API access or verification at all, just opens
// WhatsApp with the message pre-filled for the admin to review and send.
const buildWhatsAppMessage = (order) => {
  const name = order.shippingAddress?.fullName || "there";
  const id = order._id;

  switch (order.orderStatus) {
    case "Processing":
      return `Hi ${name}, your order (ID: ${id}) at Mittal Collections is now being processed and will be shipped soon.`;
    case "Shipped":
      return `Hi ${name}, good news! Your order (ID: ${id}) has shipped and is on its way.`;
    case "Delivered":
      return `Hi ${name}, your order (ID: ${id}) has been delivered! We hope you love it. If you have a moment, we'd really appreciate a review.`;
    case "Cancelled":
      return `Hi ${name}, your order (ID: ${id}) has been cancelled. If a coupon or loyalty points were used, they've been refunded to your account.`;
    default: {
      const itemsList = order.orderItems
        .map((item) => `${item.name} x${item.quantity}`)
        .join(", ");

      return `Hi ${name}, thanks for your order at Mittal Collections!\n\nOrder ID: ${id}\nItems: ${itemsList}\nTotal: ₹${order.totalPrice}\n\nWe'll keep you updated as it's processed.`;
    }
  }
};

// Indian mobile numbers are stored as plain 10-digit strings — wa.me
// needs the country code prefixed with no other formatting.
const buildWhatsAppLink = (order) => {
  const digits = (order.shippingAddress?.mobile || "").replace(/\D/g, "");
  if (!digits) return null;

  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(buildWhatsAppMessage(order));

  return `https://wa.me/${withCountryCode}?text=${text}`;
};

function AdminOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [expandedId, setExpandedId] = useState(highlightId);
  const [sortOrder, setSortOrder] = useState("desc");

  const highlightedRowRef = useRef(null);

  const loadOrders = async () => {
    setLoading(true);

    const response = await getAllOrders({ sortOrder });

    if (response.success) {
      setOrders(response.orders);
      setFilteredOrders(response.orders);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  useEffect(() => {
    if (!highlightId || loading || !highlightedRowRef.current) return;

    highlightedRowRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    // clean the URL so a page refresh doesn't keep forcing this order open
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, highlightId]);

  useEffect(() => {
    let result = orders;

    if (statusFilter !== "All") {
      result = result.filter((order) => order.orderStatus === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();

      result = result.filter(
        (order) =>
          order._id.toLowerCase().includes(q) ||
          order.user?.name?.toLowerCase().includes(q) ||
          order.user?.email?.toLowerCase().includes(q),
      );
    }

    setFilteredOrders(result);
  }, [search, statusFilter, orders]);

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);

    const response = await updateOrderStatus(id, newStatus);

    if (response.success) {
      setOrders((prev) =>
        prev.map((order) =>
          order._id === id ? { ...order, orderStatus: newStatus } : order,
        ),
      );
    } else {
      alert(response.message || "Unable to update order status");
    }

    setUpdatingId(null);
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;

    const response = await deleteOrder(id);

    if (response.success) {
      loadOrders();
    } else {
      alert(response.message || "Unable to delete order");
    }
  };

  const handleRestore = async (id) => {
    const response = await restoreOrder(id);

    if (response.success) {
      loadOrders();
    } else {
      alert(response.message || "Unable to restore order");
    }
  };

  const handlePermanentDelete = async (id) => {
    if (
      !window.confirm("Permanently delete this order? This cannot be undone.")
    )
      return;

    const response = await permanentlyDeleteOrder(id);

    if (response.success) {
      loadOrders();
    } else {
      alert(response.message || "Unable to permanently delete order");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading Orders...</div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Manage Orders</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by Order ID, Customer name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() =>
            setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
          }
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50 whitespace-nowrap"
        >
          {sortOrder === "desc" ? (
            <FaSortAmountDown className="text-xs" />
          ) : (
            <FaSortAmountUp className="text-xs" />
          )}
          {sortOrder === "desc" ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Orders Found
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div
              key={order._id}
              ref={order._id === highlightId ? highlightedRowRef : null}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                order._id === highlightId
                  ? "border-amber-400 ring-2 ring-amber-200"
                  : "border-slate-200"
              }`}
            >
              {/* Order Summary Row */}
              <div
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 cursor-pointer"
                onClick={() => toggleExpand(order._id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 font-mono truncate">
                    #{order._id}
                  </p>
                  <p className="font-semibold text-slate-800">
                    {order.user?.name || "Unknown User"}
                  </p>
                  <p className="text-sm text-slate-500">{order.user?.email}</p>
                </div>

                <div className="text-sm text-slate-600">
                  {new Date(order.createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>

                <div className="font-bold text-slate-900">
                  ₹{order.totalPrice}
                </div>

                <div className="flex items-center gap-2">
                  {!order.isActive && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full w-fit bg-slate-800 text-white">
                      Deleted
                    </span>
                  )}

                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full w-fit ${
                      STATUS_COLORS[order.orderStatus] ||
                      "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {order.orderStatus}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(order._id);
                    }}
                    className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                  >
                    View History
                  </button>

                  {buildWhatsAppLink(order) && (
                    <a
                      href={buildWhatsAppLink(order)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Send WhatsApp update to customer"
                      className="w-7 h-7 shrink-0 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:opacity-90"
                    >
                      <FaWhatsapp className="text-sm" />
                    </a>
                  )}
                </div>

                <select
                  value={order.orderStatus}
                  disabled={updatingId === order._id || !order.isActive}
                  title={!order.isActive ? "Restore this order to change its status" : undefined}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    handleStatusChange(order._id, e.target.value)
                  }
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Expanded Details */}
              {expandedId === order._id && (
                <div className="border-t border-slate-100 p-4 bg-slate-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Items */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">
                        Items
                      </h4>
                      <div className="space-y-2">
                        {order.orderItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 text-sm"
                          >
                            {item.image && (
                              <Link
                                to={`/product/${item.product}`}
                                target="_blank"
                                className="shrink-0"
                              >
                                <img
                                  src={`${imgUrl(item.image)}`}
                                  alt={item.name}
                                  className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                                />
                              </Link>
                            )}
                            <div className="flex-1">
                              <Link
                                to={`/product/${item.product}`}
                                target="_blank"
                                className="text-slate-800 hover:text-blue-600 hover:underline"
                              >
                                {item.name}
                                {item.size ? ` (Size: ${item.size})` : ""}
                              </Link>
                              <p className="text-slate-500 text-xs">
                                Qty: {item.quantity} × ₹{item.price}
                              </p>
                              <p className="text-slate-400 text-xs font-mono">
                                Product ID: {item.product}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Shipping Address */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">
                        Shipping Address
                      </h4>
                      <div className="text-sm text-slate-600 space-y-0.5">
                        <p>{order.shippingAddress?.fullName}</p>
                        <p>{order.shippingAddress?.mobile}</p>
                        <p>{order.shippingAddress?.address}</p>
                        <p>
                          {order.shippingAddress?.city},{" "}
                          {order.shippingAddress?.state} -{" "}
                          {order.shippingAddress?.pincode}
                        </p>
                      </div>

                      <div className="mt-3 text-sm text-slate-600">
                        <p>
                          Payment:{" "}
                          <span className="font-medium">
                            {order.paymentMethod}
                          </span>
                        </p>
                        <p>
                          Paid:{" "}
                          <span className="font-medium">
                            {order.isPaid ? "Yes" : "No"}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Price Breakdown — same numbers the customer sees on
                        their own Order Details page, so support/admin and
                        customer are never looking at different totals. */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">
                        Price Breakdown
                      </h4>
                      <div className="text-sm text-slate-600 space-y-1 bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex justify-between">
                          <span>Items</span>
                          <span>
                            ₹
                            {order.orderItems.reduce(
                              (sum, item) => sum + item.price * item.quantity,
                              0,
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Delivery</span>
                          <span>
                            {!order.deliveryFee
                              ? "FREE"
                              : `₹${order.deliveryFee}`}
                          </span>
                        </div>
                        {order.codCharge > 0 && (
                          <div className="flex justify-between">
                            <span>COD charge</span>
                            <span>₹{order.codCharge}</span>
                          </div>
                        )}
                        {order.discountAmount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>
                              Coupon discount
                              {order.couponCode
                                ? ` (${order.couponCode})`
                                : ""}
                            </span>
                            <span>-₹{order.discountAmount}</span>
                          </div>
                        )}
                        {order.bundleDiscountAmount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>
                              Bundle discount ({order.bundleDiscountPercent}%)
                              {order.bundleDiscountCategories?.length === 2
                                ? ` — ${order.bundleDiscountCategories[0]} + ${order.bundleDiscountCategories[1]}`
                                : ""}
                            </span>
                            <span>-₹{order.bundleDiscountAmount}</span>
                          </div>
                        )}
                        {order.pointsDiscount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>
                              Loyalty points ({order.pointsRedeemed} pts)
                            </span>
                            <span>-₹{order.pointsDiscount}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1.5 mt-1">
                          <span>Total</span>
                          <span>₹{order.totalPrice}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Order History */}
                  <div className="mt-6 pt-4 border-t border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">
                      Order History
                    </h4>

                    {order.statusHistory?.length > 0 ? (
                      <ol className="space-y-2">
                        {order.statusHistory.map((entry, idx) => (
                          <li
                            key={idx}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span
                              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                STATUS_COLORS[entry.status] ||
                                "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {entry.status}
                            </span>
                            <span className="text-slate-500">
                              {new Date(entry.changedAt).toLocaleString(
                                "en-IN",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-slate-400">
                        No history recorded before this order's current
                        status ({order.orderStatus}).
                      </p>
                    )}
                  </div>

                  {/* Delete / Restore — only ever possible once the order
                      is Cancelled, so a live order can't be removed by
                      mistake. */}
                  <div className="mt-6 pt-4 border-t border-slate-200 flex items-center gap-3">
                    {order.isActive ? (
                      order.orderStatus === "Cancelled" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(order._id);
                          }}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5"
                        >
                          Delete Order
                        </button>
                      ) : (
                        <p className="text-xs text-slate-400">
                          Cancel this order to enable deleting it.
                        </p>
                      )
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(order._id);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg px-3 py-1.5"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePermanentDelete(order._id);
                          }}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5"
                        >
                          Delete Permanently
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminOrders;
