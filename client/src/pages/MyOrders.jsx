import { imgUrl } from "../services/api";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMyOrders } from "../services/orderService";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import ReturnRequestModal from "../components/ReturnRequestModal";

const TABS = [
  { key: "orders", label: "Orders" },
  { key: "buyAgain", label: "Buy Again" },
];

const STATUS_TEXT = {
  Pending: {
    headline: "Order Placed",
    subtext: "We've received your order and will process it shortly.",
  },
  Processing: {
    headline: "Processing",
    subtext: "Your order is being packed.",
  },
  Shipped: {
    headline: "Shipped",
    subtext: "Your order is on its way.",
  },
  Delivered: {
    headline: "Delivered",
    subtext: "Your package has been delivered.",
  },
  Cancelled: {
    headline: "Order Cancelled",
    subtext: "This order was cancelled.",
  },
};

const STATUS_DOT = {
  Pending: "text-slate-500",
  Processing: "text-blue-600",
  Shipped: "text-amber-600",
  Delivered: "text-green-600",
  Cancelled: "text-red-600",
};

function OrderCard({ order, onBuyAgain }) {
  const navigate = useNavigate();
  const [returnModalItem, setReturnModalItem] = useState(null);
  const [returnedProductIds, setReturnedProductIds] = useState(new Set());
  const statusInfo = STATUS_TEXT[order.orderStatus] || STATUS_TEXT.Pending;
  const isDelivered = order.orderStatus === "Delivered";
  const isCancelled = order.orderStatus === "Cancelled";
  const deliveredDate = order.deliveredAt
    ? new Date(order.deliveredAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
      })
    : null;

  const handleGetSupport = (e) => {
    e.preventDefault();
    navigate(`/tickets?order=${order._id}`);
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Header bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div>
            <p className="text-slate-500 uppercase tracking-wide">
              Order Placed
            </p>
            <p className="font-medium text-slate-800">
              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-slate-500 uppercase tracking-wide">Total</p>
            <p className="font-medium text-slate-800">
              ₹{order.totalPrice.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-slate-500 uppercase tracking-wide">Ship To</p>
            <p className="font-medium text-slate-800">
              {order.shippingAddress?.fullName || "—"}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-slate-500">
            ORDER # {order._id.slice(-12).toUpperCase()}
          </p>
          <Link
            to={`/my-orders/${order._id}`}
            className="text-blue-700 hover:underline font-medium"
          >
            View order details
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col md:flex-row gap-5 md:items-start">
        <div className="flex-1 min-w-0">
          <p
            className={`font-bold ${isCancelled ? "text-red-700" : "text-slate-900"}`}
          >
            {statusInfo.headline}
            {isDelivered && deliveredDate ? ` ${deliveredDate}` : ""}
          </p>
          <p className="text-sm text-slate-500 mb-4">{statusInfo.subtext}</p>

          <div className="space-y-3">
            {order.orderItems?.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                {item.image && (
                  <img
                    src={imgUrl(item.image)}
                    alt={item.name}
                    className="w-14 h-14 object-cover rounded-lg shrink-0 border border-slate-100"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 line-clamp-2">
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-500 mb-1">
                    Qty {item.quantity} · ₹{item.price}
                  </p>

                  {isDelivered && item.returnInfo && (
                    <>
                      {returnedProductIds.has(item.product) ? (
                        <p className="text-xs font-medium text-green-700">
                          Return requested
                        </p>
                      ) : item.returnInfo.eligible ? (
                        <button
                          type="button"
                          onClick={() => setReturnModalItem(item)}
                          className="text-xs font-medium text-blue-700 hover:underline"
                        >
                          Return this item
                        </button>
                      ) : item.returnInfo.isReturnable &&
                        item.returnInfo.deadline ? (
                        <p className="text-xs text-slate-400">
                          Return window closed on{" "}
                          {new Date(
                            item.returnInfo.deadline,
                          ).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      ) : !item.returnInfo.isReturnable ? (
                        <p className="text-xs text-slate-400">
                          Non-returnable item
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {returnModalItem && (
          <ReturnRequestModal
            order={order}
            item={returnModalItem}
            onClose={() => setReturnModalItem(null)}
            onSubmitted={() =>
              setReturnedProductIds(
                (prev) => new Set([...prev, returnModalItem.product]),
              )
            }
          />
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 w-full md:w-56 shrink-0">
          {isDelivered && (
            <button
              type="button"
              onClick={handleGetSupport}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full py-2.5 transition-colors"
            >
              Get Product Support
            </button>
          )}

          {!isDelivered && !isCancelled && (
            <Link
              to={`/my-orders/${order._id}`}
              className="text-center bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full py-2.5 transition-colors"
            >
              Track Order
            </Link>
          )}

          <Link
            to={`/my-orders/${order._id}`}
            className="text-center border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-full py-2.5 transition-colors"
          >
            View Order Details
          </Link>

          {(isDelivered || isCancelled) && (
            <button
              type="button"
              onClick={() => onBuyAgain(order.orderItems)}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-full py-2.5 transition-colors"
            >
              Buy It Again
            </button>
          )}

          {!isCancelled && (
            <span
              className={`text-xs font-medium text-center ${STATUS_DOT[order.orderStatus]}`}
            >
              ● {order.orderStatus}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const { addToCart } = useCart();
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/my-orders");
      return;
    }

    const loadOrders = async () => {
      const response = await getMyOrders();

      if (response?.success) {
        setOrders(response.orders);
      }

      setLoading(false);
    };

    loadOrders();
  }, [isLoggedIn, navigate]);

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

  const handleBuyAgain = (items) => {
    items?.forEach((item) =>
      addToCart({
        _id: item.product,
        name: item.name,
        image: item.image,
        price: item.price,
      }),
    );
  };

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
                  <OrderCard
                    key={order._id}
                    order={order}
                    onBuyAgain={handleBuyAgain}
                  />
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
