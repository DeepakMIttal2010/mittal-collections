import { imgUrl } from "../services/api";
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";

import { getOrderById } from "../services/orderService";
import { useAuth } from "../context/AuthContext";
import OrderStatusTimeline from "../components/OrderStatusTimeline";

const STATUS_COLORS = {
  Pending: "bg-slate-100 text-slate-700",
  Processing: "bg-blue-100 text-blue-700",
  Shipped: "bg-amber-100 text-amber-700",
  Delivered: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

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
        Loading order...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Order not found
        </h2>
        <Link to="/my-orders" className="text-blue-700 hover:underline">
          Back to your orders
        </Link>
      </div>
    );
  }

  const itemsSubtotal = order.orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const deliveryFee =
    order.totalPrice +
    (order.discountAmount || 0) +
    (order.pointsDiscount || 0) -
    itemsSubtotal;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          Your Account
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <Link to="/my-orders" className="text-blue-700 hover:underline">
          Your Orders
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">Order Details</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Order #{order._id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-sm text-slate-500">
            Placed on{" "}
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
          {order.orderStatus}
        </span>
      </div>

      <div className="border border-slate-200 rounded-xl bg-white p-5 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Order Status</h2>
        <OrderStatusTimeline order={order} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: items + address */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <h2 className="font-semibold text-slate-800 px-5 py-4 border-b border-slate-100">
              Items
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
              Delivery Address
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.address}, {order.shippingAddress.city},{" "}
              {order.shippingAddress.state} {order.shippingAddress.pincode}
              <br />
              Phone: {order.shippingAddress.mobile}
            </p>
          </div>
        </div>

        {/* Right: summary */}
        <div>
          <div className="border border-slate-200 rounded-xl p-5 bg-white sticky top-4">
            <h2 className="font-semibold text-slate-800 mb-4">
              Order Summary
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Items:</span>
                <span>₹{itemsSubtotal}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery:</span>
                <span>{deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>
                    Discount{order.couponCode ? ` (${order.couponCode})` : ""}
                    :
                  </span>
                  <span>-₹{order.discountAmount}</span>
                </div>
              )}
              {order.pointsDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Points redeemed ({order.pointsRedeemed}):</span>
                  <span>-₹{order.pointsDiscount}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 mt-3 pt-3 flex justify-between">
              <span className="font-bold text-slate-900">Order Total:</span>
              <span className="font-bold text-slate-900">
                ₹{order.totalPrice}
              </span>
            </div>

            <div className="border-t border-slate-100 mt-4 pt-4 text-sm text-slate-600 space-y-1">
              <p>Payment: {order.paymentMethod}</p>
              <p>{order.isPaid ? "Paid" : "Not yet paid"}</p>
              {order.pointsEarned > 0 && (
                <p className="text-amber-600">
                  You earned {order.pointsEarned} loyalty points on this order
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
