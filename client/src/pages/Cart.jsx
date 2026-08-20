import { useEffect, useState } from "react";
import { imgUrl } from "../services/api";
import { Link } from "react-router-dom";
import { FaTrash, FaPlus, FaMinus, FaGift, FaTags } from "react-icons/fa";

import { useCart } from "../context/CartContext";
import { getPublicRewardsInfo } from "../services/rewardsService";
import { getSiteSettings } from "../services/settingsService";
import { calculateDeliveryFee } from "../utils/shipping";
import "./Cart.css";

function Cart() {
  const {
    cartItems,
    increaseQty,
    decreaseQty,
    removeFromCart,
    clearCart,
    totalItems,
    totalPrice,
    bundleInfo,
  } = useCart();

  const [showBundleInfo, setShowBundleInfo] = useState(false);
  const [earnRate, setEarnRate] = useState(null);
  const [shipping, setShipping] = useState({
    freeShippingThreshold: 499,
    deliveryFee: 49,
    shippingTiers: [],
  });

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setEarnRate(response.loyalty.earnRate);
    });

    getSiteSettings().then((response) => {
      if (response.success) {
        setShipping({
          freeShippingThreshold:
            response.settings.freeShippingThreshold ?? 499,
          deliveryFee: response.settings.deliveryFee ?? 49,
          shippingTiers: response.settings.shippingTiers || [],
        });
      }
    });
  }, []);

  const pointsPreview = earnRate ? Math.floor(totalPrice / earnRate) : 0;
  const deliveryFee = calculateDeliveryFee(totalPrice, shipping);
  const orderTotal = Math.max(
    totalPrice + deliveryFee - bundleInfo.discountAmount,
    0,
  );

  if (cartItems.length === 0) {
    return (
      <div className="empty-cart">
        <h2>Your Cart is Empty</h2>

        <p>Looks like you haven't added any products yet.</p>

        <Link to="/" className="shop-btn">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <section className="cart-page">
      <div className="container">
        <h2 className="cart-title">Shopping Cart</h2>

        <div className="cart-layout">
          {/* Left */}

          <div className="cart-items">
            {cartItems.map((item) => (
              <div key={item._id} className="cart-item">
                <img
                  src={
                    item.image?.startsWith("http")
                      ? item.image
                      : `${imgUrl(item.image)}`
                  }
                  alt={item.name}
                />

                <div className="cart-info">
                  <h3>{item.name}</h3>

                  <p>
                    {item.category?.name}
                    {item.selectedSize ? ` · Size: ${item.selectedSize}` : ""}
                  </p>

                  <h4>₹{item.price}</h4>
                </div>

                <div className="qty-box">
                  <button onClick={() => decreaseQty(item._id)}>
                    <FaMinus />
                  </button>

                  <span>{item.quantity}</span>

                  <button onClick={() => increaseQty(item._id)}>
                    <FaPlus />
                  </button>
                </div>

                <h3>₹{item.price * item.quantity}</h3>

                <button
                  className="delete-btn"
                  onClick={() => removeFromCart(item._id)}
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>

          {/* Right */}

          <div className="cart-summary">
            <h3>Order Summary</h3>

            {bundleInfo.eligible ? (
              <div
                style={{
                  background: "#eef2ff",
                  border: "1px solid #c7d2fe",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  margin: "0 0 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#3730a3", fontWeight: 700, fontSize: "0.9rem" }}>
                  <FaTags style={{ fontSize: "0.85rem" }} />
                  Extra {bundleInfo.discountPercent}% OFF Applied!
                </div>
                <div style={{ color: "#4338ca", fontSize: "0.8rem" }}>
                  Complete the Look bundle discount applied to your order.
                </div>
              </div>
            ) : (
              bundleInfo.missingCategoryLabel && (
                <Link
                  to={`/category/${bundleInfo.missingCategorySlug}`}
                  style={{
                    display: "block",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    margin: "0 0 14px",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1e40af", fontWeight: 700, fontSize: "0.9rem" }}>
                    <FaTags style={{ fontSize: "0.85rem" }} />
                    Get Extra {bundleInfo.discountPercent}% OFF!
                  </div>
                  <div style={{ color: "#1d4ed8", fontSize: "0.8rem" }}>
                    Add {bundleInfo.missingCategoryLabel} to your cart and
                    unlock an additional {bundleInfo.discountPercent}% OFF.
                  </div>
                  <div style={{ color: "#1e40af", fontSize: "0.8rem", fontWeight: 700 }}>
                    Shop {bundleInfo.missingCategoryLabel} →
                  </div>
                </Link>
              )
            )}

            <div className="summary-row">
              <span>Total Items</span>
              <span>{totalItems}</span>
            </div>

            <div className="summary-row">
              <span>Subtotal</span>
              <span>₹{totalPrice}</span>
            </div>

            <div className="summary-row">
              <span>Shipping*</span>
              <span>{deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}</span>
            </div>

            {bundleInfo.discountAmount > 0 && (
              <>
                <div className="summary-row" style={{ color: "#15803d" }}>
                  <button
                    type="button"
                    onClick={() => setShowBundleInfo((prev) => !prev)}
                    style={{
                      color: "#15803d",
                      textDecoration: "underline",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    Bundle discount ({bundleInfo.discountPercent}%)*
                  </button>
                  <span>-₹{bundleInfo.discountAmount}</span>
                </div>

                {showBundleInfo && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      margin: "0 0 10px",
                      fontSize: "0.8rem",
                      color: "#166534",
                    }}
                  >
                    <p style={{ fontWeight: 700, marginBottom: "6px" }}>
                      Items in this bundle
                    </p>
                    {bundleInfo.eligibleItems.map((item) => (
                      <div
                        key={item._id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "3px",
                        }}
                      >
                        <span>
                          {item.name} × {item.quantity}
                        </span>
                        <span>₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        borderTop: "1px solid #bbf7d0",
                        marginTop: "6px",
                        paddingTop: "6px",
                        fontWeight: 700,
                      }}
                    >
                      <span>Eligible subtotal</span>
                      <span>₹{bundleInfo.eligibleSubtotal}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontWeight: 700,
                      }}
                    >
                      <span>{bundleInfo.discountPercent}% off</span>
                      <span>-₹{bundleInfo.discountAmount}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <hr />

            <div className="summary-row total">
              <span>Total</span>
              <span>₹{orderTotal}</span>
            </div>

            <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "8px" }}>
              *Shipping varies by delivery address and order value.
              {bundleInfo.discountAmount > 0 &&
                " *Bundle discount applies to the best-matching pair only — other items aren't discounted twice."}
            </p>

            {pointsPreview > 0 && (
              <p
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  color: "#b45309",
                  margin: "10px 0",
                }}
              >
                <FaGift />
                You&apos;ll earn {pointsPreview} loyalty points on this order
              </p>
            )}

            <Link to="/checkout" className="checkout-btn">
              Proceed to Checkout
            </Link>

            <button className="clear-btn" onClick={clearCart}>
              Clear Cart
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Cart;
