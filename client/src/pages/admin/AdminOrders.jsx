import { imgUrl } from "../../services/api";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  getAllOrders,
  updateOrderStatus,
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

  const highlightedRowRef = useRef(null);

  const loadOrders = async () => {
    setLoading(true);

    const response = await getAllOrders();

    if (response.success) {
      setOrders(response.orders);
      setFilteredOrders(response.orders);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

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
                  {new Date(order.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>

                <div className="font-bold text-slate-900">
                  ₹{order.totalPrice}
                </div>

                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full w-fit ${
                    STATUS_COLORS[order.orderStatus] ||
                    "bg-slate-100 text-slate-700"
                  }`}
                >
                  {order.orderStatus}
                </span>

                <select
                  value={order.orderStatus}
                  disabled={updatingId === order._id}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
