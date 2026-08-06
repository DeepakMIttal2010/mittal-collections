import { useEffect, useState } from "react";
import { imgUrl } from "../services/api";
import { Link } from "react-router-dom";
import { FaTrash, FaPlus, FaMinus, FaGift } from "react-icons/fa";

import { useCart } from "../context/CartContext";
import { getPublicRewardsInfo } from "../services/rewardsService";
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
  } = useCart();

  const [earnRate, setEarnRate] = useState(null);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setEarnRate(response.loyalty.earnRate);
    });
  }, []);

  const pointsPreview = earnRate ? Math.floor(totalPrice / earnRate) : 0;

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

                  <p>{item.category?.name}</p>

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

            <div className="summary-row">
              <span>Total Items</span>
              <span>{totalItems}</span>
            </div>

            <div className="summary-row">
              <span>Subtotal</span>
              <span>₹{totalPrice}</span>
            </div>

            <div className="summary-row">
              <span>Shipping</span>
              <span>FREE</span>
            </div>

            <hr />

            <div className="summary-row total">
              <span>Total</span>
              <span>₹{totalPrice}</span>
            </div>

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
