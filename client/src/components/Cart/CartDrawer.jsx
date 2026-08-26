import { useEffect, useState } from "react";
import { imgUrl } from "../../services/api";
import { Link, useNavigate } from "react-router-dom";
import { FaTimes, FaPlus, FaMinus, FaLock, FaGift } from "react-icons/fa";

import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { getPublicRewardsInfo } from "../../services/rewardsService";
import { getSiteSettings } from "../../services/settingsService";

function CartDrawer() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const {
    cartItems,
    increaseQty,
    decreaseQty,
    removeFromCart,
    totalItems,
    totalPrice,
    isCartOpen,
    closeCart,
  } = useCart();

  const [earnRate, setEarnRate] = useState(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(499);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setEarnRate(response.loyalty.earnRate);
    });

    getSiteSettings().then((response) => {
      if (response.success) {
        setFreeShippingThreshold(response.settings.freeShippingThreshold ?? 499);
      }
    });
  }, []);

  const pointsPreview = earnRate ? Math.floor(totalPrice / earnRate) : 0;

  const handleCheckout = () => {
    closeCart();
    navigate(isLoggedIn ? "/checkout" : "/login?redirect=/checkout");
  };

  const remaining = Math.max(freeShippingThreshold - totalPrice, 0);
  const progressPct = Math.min(
    (totalPrice / freeShippingThreshold) * 100,
    100,
  );

  return (
    <>
      <div
        onClick={closeCart}
        className={`fixed inset-0 bg-black/40 z-[100] transition-opacity ${
          isCartOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      <div
        className={`fixed top-0 right-0 h-full w-[88%] max-w-sm bg-white z-[101] shadow-xl flex flex-col transition-transform duration-300 ${
          isCartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">
            Cart
            {totalItems > 0 && (
              <sup className="ml-1 text-sm font-semibold">{totalItems}</sup>
            )}
          </h2>

          <button
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
            className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"
          >
            <FaTimes />
          </button>
        </div>

        {cartItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-slate-500">Your cart is empty.</p>
            <Link
              to="/"
              onClick={closeCart}
              className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-slate-100">
              <p className="text-sm text-slate-700">
                {remaining === 0 ? (
                  <span className="font-medium">
                    You are eligible for free shipping!
                  </span>
                ) : (
                  <>
                    Add ₹{remaining} more for{" "}
                    <span className="font-semibold">free shipping</span>
                  </>
                )}
              </p>
              <div className="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-slate-900 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 divide-y divide-slate-100">
              {cartItems.map((item) => (
                <div key={item._id} className="flex gap-4 py-4">
                  <img
                    src={
                      item.image?.startsWith("http")
                        ? item.image
                        : `${imgUrl(item.image)}`
                    }
                    alt={item.name}
                    className="w-20 h-20 object-cover rounded-lg shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">
                      {item.name}
                    </p>
                    {item.selectedSize && (
                      <p className="text-xs text-slate-400">
                        Size: {item.selectedSize}
                      </p>
                    )}
                    <p className="text-sm text-slate-500 mt-1">
                      ₹{item.price}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item._id)}
                      className="text-xs underline text-slate-500 mt-2"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="flex flex-col items-center gap-1 border border-slate-200 rounded-lg h-fit px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => increaseQty(item._id)}
                      className="text-xs text-slate-600 hover:text-slate-900 p-1"
                    >
                      <FaPlus />
                    </button>
                    <span className="text-sm font-medium">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => decreaseQty(item._id)}
                      className="text-xs text-slate-600 hover:text-slate-900 p-1"
                    >
                      <FaMinus />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
              <p className="text-xs text-slate-500 mb-3">
                Tax included. Shipping calculated at checkout.
              </p>

              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800">
                  Subtotal
                </span>
                <span className="font-bold text-lg text-slate-900">
                  ₹{totalPrice}
                </span>
              </div>

              <p className="flex items-center gap-1.5 text-xs text-amber-700 mb-4 min-h-[1em]">
                {pointsPreview > 0 && (
                  <>
                    <FaGift />
                    You&apos;ll earn {pointsPreview} loyalty points on this
                    order
                  </>
                )}
              </p>

              <button
                type="button"
                onClick={handleCheckout}
                className="flex items-center justify-center gap-2 w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 transition-colors"
              >
                <FaLock className="text-xs" />
                Check out
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default CartDrawer;
