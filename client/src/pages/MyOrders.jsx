import { imgUrl } from "../services/api";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMyOrders } from "../services/orderService";
import { useCart } from "../context/CartContext";

const TABS = [
  { key: "orders", label: "Orders" },
  { key: "buyAgain", label: "Buy Again" },
];

const STATUS_COLORS = {
  Pending: "bg-slate-100 text-slate-700",
  Processing: "bg-blue-100 text-blue-700",
  Shipped: "bg-amber-100 text-amber-700",
  Delivered: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

function OrderCard({ order }) {
  return (
    <Link
      to={`/my-orders/${order._id}`}
      className="block border border-slate-200 rounded-xl p-5 bg-white hover:border-amber-400 hover:shadow-sm transition-all"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="font-semibold text-slate-800">
          Order ID: {order._id}
        </h4>
        <span
          className={`text-xs font-medium px-3 py-1 rounded-full ${
            STATUS_COLORS[order.orderStatus] || "bg-slate-100 text-slate-700"
          }`}
        >
          {order.orderStatus}
        </span>
      </div>

      <p className="text-sm text-slate-600">Total: ₹{order.totalPrice}</p>
      <p className="text-sm text-slate-600">
        Date: {new Date(order.createdAt).toLocaleDateString()}
      </p>

      {order.orderItems?.length > 0 && (
        <ul className="mt-3 text-sm text-slate-500 space-y-1">
          {order.orderItems.map((item, i) => (
            <li key={i}>
              {item.name} × {item.quantity}
            </li>
          ))}
        </ul>
      )}

      <span className="inline-block mt-3 text-sm text-blue-700 font-medium">
        View order details →
      </span>
    </Link>
  );
}

function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const { addToCart } = useCart();

  useEffect(() => {
    const loadOrders = async () => {
      const response = await getMyOrders();

      if (response?.success) {
        setOrders(response.orders);
      }

      setLoading(false);
    };

    loadOrders();
  }, []);

  const buyAgainItems = useMemo(() => {
    const seen = new Map();

    orders.forEach((order) => {
      order.orderItems?.forEach((item) => {
        if (!seen.has(item.product)) {
          seen.set(item.product, item);
        }
      });
    });

    return Array.from(seen.values());
  }, [orders]);

  const tabClass = (key) =>
    `pb-3 text-sm font-medium border-b-2 transition-colors ${
      activeTab === key
        ? "border-amber-600 text-amber-600"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          Your Account
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">Your Orders</span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-6">Your Orders</h1>

      <div className="flex gap-8 border-b border-slate-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={tabClass(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <>
          {activeTab === "orders" &&
            (orders.length === 0 ? (
              <p className="text-slate-500">No Orders Found.</p>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <OrderCard key={order._id} order={order} />
                ))}
              </div>
            ))}

          {activeTab === "buyAgain" &&
            (buyAgainItems.length === 0 ? (
              <p className="text-slate-500">
                Items from your past orders will show up here.
              </p>
            ) : (
              <div className="space-y-3">
                {buyAgainItems.map((item) => (
                  <div
                    key={item.product}
                    className="flex items-center justify-between gap-4 border border-slate-200 rounded-xl p-4 bg-white"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {item.image && (
                        <img
                          src={`${imgUrl(item.image)}`}
                          alt={item.name}
                          className="w-14 h-14 object-cover rounded-lg shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {item.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          ₹{item.price}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        addToCart({
                          _id: item.product,
                          name: item.name,
                          image: item.image,
                          price: item.price,
                        })
                      }
                      className="shrink-0 bg-blue-900 hover:bg-blue-950 text-white text-sm font-medium px-4 py-2 rounded-full transition-colors"
                    >
                      Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </>
      )}
    </div>
  );
}

export default MyOrders;
