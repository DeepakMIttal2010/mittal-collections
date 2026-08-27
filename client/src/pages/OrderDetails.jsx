import { imgUrl } from "../services/api";
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";

import { getOrderById } from "../services/orderService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import OrderStatusTimeline from "../components/OrderStatusTimeline";

const STATUS_COLORS = {
  Pending: "bg-slate-100 text-slate-700",
  Processing: "bg-blue-100 text-blue-700",
  Shipped: "bg-amber-100 text-amber-700",
  Delivered: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
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

function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate(`/login?redirect=/my-orders/${id}`);
      return;
    }

    const load = async () => {
      setLoading(true);

      const response = await getOrderById(id);

      if (response?.success) setOrder(response.order);

      setLoading(false);
    };

    load();
  }, [id, isLoggedIn, navigate]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-500">
        {t("Loading order...", "ऑर्डर लोड हो रहा है...")}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          {t("Order not found", "ऑर्डर नहीं मिला")}
        </h2>
        <Link to="/my-orders" className="text-blue-700 hover:underline">
          {t("Back to your orders", "अपने ऑर्डर पर वापस जाएं")}
        </Link>
      </div>
    );
  }

  const itemsSubtotal = order.orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          {t("Your Account", "आपका खाता")}
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <Link to="/my-orders" className="text-blue-700 hover:underline">
          {t("Your Orders", "आपके ऑर्डर")}
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">{t("Order Details", "ऑर्डर विवरण")}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("Order #", "ऑर्डर #")}{order._id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-sm text-slate-500">
            {t("Placed on ", "दिनांक ")}
            {new Date(order.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <span
          className={`text-sm font-semibold px-3.5 py-1.5 rounded-full ${
            STATUS_COLORS[order.orderStatus] || "bg-slate-100 text-slate-700"
          }`}
        >
          {getStatusLabel(t, order.orderStatus)}
        </span>
      </div>

      <div className="border border-slate-200 rounded-xl bg-white p-5 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">{t("Order Status", "ऑर्डर स्टेटस")}</h2>
        <OrderStatusTimeline order={order} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: items + address */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <h2 className="font-semibold text-slate-800 px-5 py-4 border-b border-slate-100">
              {t("Items", "आइटम")}
            </h2>
            <div className="divide-y divide-slate-100">
              {order.orderItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 px-5 py-4"
                >
                  {item.image && (
                    <img
                      src={imgUrl(item.image)}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 truncate">
                      {item.name}
                    </p>
                    {item.size && (
                      <p className="text-xs text-slate-400">
                        {t("Size", "साइज़")}: {item.size}
                      </p>
                    )}
                    <p className="text-sm text-slate-500">
                      ₹{item.price} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-800 shrink-0">
                    ₹{item.price * item.quantity}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl bg-white p-5">
            <h2 className="font-semibold text-slate-800 mb-3">
              {t("Delivery Address", "डिलीवरी पता")}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.address}, {order.shippingAddress.city},{" "}
              {order.shippingAddress.state} {order.shippingAddress.pincode}
              <br />
              {t("Phone: ", "फ़ोन: ")}{order.shippingAddress.mobile}
            </p>
          </div>
        </div>

        {/* Right: summary */}
        <div>
          <div className="border border-slate-200 rounded-xl p-5 bg-white sticky top-4">
            <h2 className="font-semibold text-slate-800 mb-4">
              {t("Order Summary", "ऑर्डर सारांश")}
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>{t("Items:", "आइटम:")}</span>
                <span>₹{itemsSubtotal}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t("Delivery*:", "डिलीवरी*:")}</span>
                <span>
                  {!order.deliveryFee ? t("FREE", "फ्री") : `₹${order.deliveryFee}`}
                </span>
              </div>
              {order.codCharge > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{t("COD charge:", "COD शुल्क:")}</span>
                  <span>₹{order.codCharge}</span>
                </div>
              )}
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>
                    {t("Discount", "छूट")}{order.couponCode ? ` (${order.couponCode})` : ""}
                    :
                  </span>
                  <span>-₹{order.discountAmount}</span>
                </div>
              )}
              {order.bundleDiscountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>
                    {t(
                      `Bundle discount (${order.bundleDiscountPercent}%)*:`,
                      `बंडल छूट (${order.bundleDiscountPercent}%)*:`,
                    )}
                  </span>
                  <span>-₹{order.bundleDiscountAmount}</span>
                </div>
              )}
              {order.bundleDiscountAmount > 0 &&
                order.bundleDiscountCategories?.length === 2 && (
                  <p className="text-xs text-slate-400">
                    {t("*Applied because your order included both ", "*लागू क्योंकि आपके ऑर्डर में दोनों शामिल थे ")}
                    {order.bundleDiscountCategories[0]} {t("and", "और")}{" "}
                    {order.bundleDiscountCategories[1]}.
                  </p>
                )}
              {order.pointsDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t(`Points redeemed (${order.pointsRedeemed}):`, `पॉइंट्स रिडीम किए (${order.pointsRedeemed}):`)}</span>
                  <span>-₹{order.pointsDiscount}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 mt-3 pt-3 flex justify-between">
              <span className="font-bold text-slate-900">{t("Order Total:", "ऑर्डर कुल:")}</span>
              <span className="font-bold text-slate-900">
                ₹{order.totalPrice}
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              {t(
                "*Delivery fee depends on the address and order value at the time of purchase.",
                "*डिलीवरी शुल्क खरीदारी के समय पते और ऑर्डर वैल्यू पर निर्भर करता है।",
              )}
            </p>

            <div className="border-t border-slate-100 mt-4 pt-4 text-sm text-slate-600 space-y-1">
              <p>{t("Payment: ", "भुगतान: ")}{order.paymentMethod}</p>
              <p>{order.isPaid ? t("Paid", "भुगतान हो गया") : t("Not yet paid", "अभी भुगतान नहीं हुआ")}</p>
              {order.pointsEarned > 0 && (
                <p className="text-amber-600">
                  {t(
                    `You earned ${order.pointsEarned} loyalty points on this order`,
                    `इस ऑर्डर पर आपको ${order.pointsEarned} लॉयल्टी पॉइंट्स मिले`,
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderDetails;
