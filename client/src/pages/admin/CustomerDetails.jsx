import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import {
  getCustomerById,
  toggleBlockCustomer,
} from "../../services/adminCustomerService";

const STATUS_COLORS = {
  Pending: "bg-slate-100 text-slate-700",
  Processing: "bg-blue-100 text-blue-700",
  Shipped: "bg-amber-100 text-amber-700",
  Delivered: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadCustomer = async () => {
    setLoading(true);

    const response = await getCustomerById(id);

    if (response.success) {
      setCustomer(response.customer);
      setOrders(response.orders);
      setTotalOrders(response.totalOrders);
      setTotalSpent(response.totalSpent);
    } else {
      alert(response.message || "Unable to load customer");
      navigate("/admin/customers");
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCustomer();
  }, [id]);

  const handleToggleBlock = async () => {
    setUpdating(true);

    const response = await toggleBlockCustomer(id);

    if (response.success) {
      setCustomer((prev) => ({ ...prev, isBlocked: response.isBlocked }));
    } else {
      alert(response.message || "Unable to update status");
    }

    setUpdating(false);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading Customer...
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="p-6">
      <Link
        to="/admin/customers"
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; Back to Customers
      </Link>

      {/* Customer Info Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {customer.name}
            </h2>
            <p className="text-slate-500">{customer.email}</p>
            <p className="text-slate-500">{customer.mobile}</p>
            <p className="text-xs text-slate-400 mt-1">
              Joined{" "}
              {new Date(customer.createdAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                customer.isBlocked
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {customer.isBlocked ? "Blocked" : "Active"}
            </span>

            <button
              onClick={handleToggleBlock}
              disabled={updating}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 ${
                customer.isBlocked
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-amber-500 hover:bg-amber-600 text-white"
              }`}
            >
              {customer.isBlocked ? "Unblock Customer" : "Block Customer"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div>
            <p className="text-sm text-slate-500">Total Orders</p>
            <p className="text-xl font-bold text-slate-800">{totalOrders}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Spent</p>
            <p className="text-xl font-bold text-slate-800">
              ₹{totalSpent}
            </p>
          </div>
        </div>
      </div>

      {/* Order History */}
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        Order History
      </h3>

      {orders.length === 0 ? (
        <div className="text-center text-slate-500 py-10 bg-white rounded-lg border border-slate-200">
          No Orders Yet
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order._id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div>
                <p className="text-xs text-slate-400 font-mono">
                  #{order._id}
                </p>
                <p className="text-sm text-slate-600">
                  {new Date(order.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerDetails;
