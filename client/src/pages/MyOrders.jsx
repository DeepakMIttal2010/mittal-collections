import { imgUrl } from "../services/api";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMyOrders } from "../services/orderService";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import ReturnRequestModal from "../components/ReturnRequestModal";

function getTabs(t) {
  return [
    { key: "orders", label: t("Orders", "ऑर्डर") },
    { key: "buyAgain", label: t("Buy Again", "फिर से खरीदें") },
  ];
}

function getStatusText(t) {
  return {
    Pending: {
      headline: t("Order Placed", "ऑर्डर दिया गया"),
      subtext: t(
        "We've received your order and will process it shortly.",
        "हमें आपका ऑर्डर मिल गया है और हम जल्द ही इसे प्रोसेस करेंगे।",
      ),
    },
    Processing: {
      headline: t("Processing", "प्रोसेसिंग"),
      subtext: t("Your order is being packed.", "आपका ऑर्डर पैक किया जा रहा है।"),
    },
    Shipped: {
      headline: t("Shipped", "शिप किया गया"),
      subtext: t("Your order is on its way.", "आपका ऑर्डर रास्ते में है।"),
    },
    Delivered: {
      headline: t("Delivered", "डिलीवर हो गया"),
      subtext: t("Your package has been delivered.", "आपका पैकेज डिलीवर हो गया है।"),
    },
    Cancelled: {
      headline: t("Order Cancelled", "ऑर्डर रद्द हुआ"),
      subtext: t("This order was cancelled.", "यह ऑर्डर रद्द कर दिया गया था।"),
    },
  };
}

const STATUS_DOT = {
  Pending: "text-slate-500",
  Processing: "text-blue-600",
  Shipped: "text-amber-600",
  Delivered: "text-green-600",
  Cancelled: "text-red-600",
};

function getStatusLabel(t, status) {
  return {
    Pending: t("Pending", "लंबित"),
    Processing: t("Processing", "प्रोसेसिंग"),
    Shipped: t("Shipped", "शिप किया गया"),
    Delivered: t("Delivered", "डिलीवर हो गया"),
    Cancelled: t("Cancelled", "रद्द"),
  }[status] || status;
}

function OrderCard({ order, onBuyAgain }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [returnModalItem, setReturnModalItem] = useState(null);
  const [returnedProductIds, setReturnedProductIds] = useState(new Set());
  const statusText = getStatusText(t);
  const statusInfo = statusText[order.orderStatus] || statusText.Pending;
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
              {t("Order Placed", "ऑर्डर दिया गया")}
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
            <p className="text-slate-500 uppercase tracking-wide">{t("Total", "कुल")}</p>
            <p className="font-medium text-slate-800">
              ₹{order.totalPrice.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-slate-500 uppercase tracking-wide">{t("Ship To", "शिप टू")}</p>
            <p className="font-medium text-slate-800">
              {order.shippingAddress?.fullName || "—"}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-slate-500">
            {t("ORDER # ", "ऑर्डर # ")}{order._id.slice(-12).toUpperCase()}
          </p>
          <Link
            to={`/my-orders/${order._id}`}
            className="text-blue-700 hover:underline font-medium"
          >
            {t("View order details", "ऑर्डर विवरण देखें")}
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
                    {item.size ? ` (${t("Size", "साइज़")}: ${item.size})` : ""}
                  </p>
                  <p className="text-xs text-slate-500 mb-1">
                    {t(`Qty ${item.quantity} · ₹${item.price}`, `मात्रा ${item.quantity} · ₹${item.price}`)}
                  </p>

                  {isDelivered && item.returnInfo && (
                    <>
                      {returnedProductIds.has(item.product) ? (
                        <p className="text-xs font-medium text-green-700">
                          {t("Return requested", "रिटर्न का अनुरोध किया गया")}
                        </p>
                      ) : item.returnInfo.eligible ? (
                        <button
                          type="button"
                          onClick={() => setReturnModalItem(item)}
                          className="text-xs font-medium text-blue-700 hover:underline"
                        >
                          {t("Return this item", "यह आइटम रिटर्न करें")}
                        </button>
                      ) : item.returnInfo.isReturnable &&
                        item.returnInfo.deadline ? (
                        <p className="text-xs text-slate-400">
                          {t("Return window closed on ", "रिटर्न विंडो बंद हो गई ")}
                          {new Date(
                            item.returnInfo.deadline,
                          ).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      ) : !item.returnInfo.isReturnable ? (
                        <p className="text-xs text-slate-400">
                          {t("Non-returnable item", "गैर-वापसी योग्य आइटम")}
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
              {t("Get Product Support", "प्रोडक्ट सपोर्ट पाएं")}
            </button>
          )}

          {!isDelivered && !isCancelled && (
            <Link
              to={`/my-orders/${order._id}`}
              className="text-center bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full py-2.5 transition-colors"
            >
              {t("Track Order", "ऑर्डर ट्रैक करें")}
            </Link>
          )}

          <Link
            to={`/my-orders/${order._id}`}
            className="text-center border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-full py-2.5 transition-colors"
          >
            {t("View Order Details", "ऑर्डर विवरण देखें")}
          </Link>

          {(isDelivered || isCancelled) && (
            <button
              type="button"
              onClick={() => onBuyAgain(order.orderItems)}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-full py-2.5 transition-colors"
            >
              {t("Buy It Again", "फिर से खरीदें")}
            </button>
          )}

          {!isCancelled && (
            <span
              className={`text-xs font-medium text-center ${STATUS_DOT[order.orderStatus]}`}
            >
              ● {getStatusLabel(t, order.orderStatus)}
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
  const { t } = useLanguage();
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

  const tabs = getTabs(t);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          {t("Your Account", "आपका खाता")}
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">{t("Your Orders", "आपके ऑर्डर")}</span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-6">{t("Your Orders", "आपके ऑर्डर")}</h1>

      <div className="flex gap-8 border-b border-slate-200 mb-6">
        {tabs.map((tab) => (
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
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      ) : (
        <>
          {activeTab === "orders" &&
            (orders.length === 0 ? (
              <p className="text-slate-500">{t("No Orders Found.", "कोई ऑर्डर नहीं मिला।")}</p>
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
                {t(
                  "Items from your past orders will show up here.",
                  "आपके पिछले ऑर्डर के आइटम यहां दिखेंगे।",
                )}
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
                          {item.size ? ` (${t("Size", "साइज़")}: ${item.size})` : ""}
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
                      {t("Add to Cart", "कार्ट में डालें")}
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
