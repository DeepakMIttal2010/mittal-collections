import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { useCart } from "../context/CartContext";
import { createOrder } from "../services/orderService";

import "./Checkout.css";

function Checkout() {
  const navigate = useNavigate();

  const { cartItems, clearCart } = useCart();

  const [formData, setFormData] = useState({
    fullName: "",
    mobile: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    paymentMethod: "COD",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const totalPrice = cartItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (cartItems.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    const orderItems = cartItems.map((item) => ({
      product: item._id,
      name: item.name,
      image: item.image,
      price: item.price,
      quantity: item.quantity,
    }));

    const response = await createOrder({
      orderItems,
      shippingAddress: {
        fullName: formData.fullName,
        mobile: formData.mobile,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
      },
      paymentMethod: formData.paymentMethod,
      totalPrice,
    });

    if (response.success) {
      toast.success("Order placed successfully 🎉");

      clearCart();

      navigate("/my-orders");
    } else {
      toast.error(response.message);
    }
  };

  return (
    <div className="checkout-page">
      <div className="container">
        <h2>Checkout</h2>

        <form onSubmit={handleSubmit} className="checkout-form">
          <input
            type="text"
            name="fullName"
            placeholder="Full Name"
            value={formData.fullName}
            onChange={handleChange}
            required
          />

          <input
            type="text"
            name="mobile"
            placeholder="Mobile Number"
            value={formData.mobile}
            onChange={handleChange}
            required
          />

          <textarea
            name="address"
            placeholder="Full Address"
            value={formData.address}
            onChange={handleChange}
            required
          />

          <input
            type="text"
            name="city"
            placeholder="City"
            value={formData.city}
            onChange={handleChange}
            required
          />

          <input
            type="text"
            name="state"
            placeholder="State"
            value={formData.state}
            onChange={handleChange}
            required
          />

          <input
            type="text"
            name="pincode"
            placeholder="PIN Code"
            value={formData.pincode}
            onChange={handleChange}
            required
          />

          <select
            name="paymentMethod"
            value={formData.paymentMethod}
            onChange={handleChange}
          >
            <option value="COD">Cash On Delivery</option>
            <option value="Razorpay">Razorpay</option>
          </select>

          <h3>Total: ₹{totalPrice}</h3>

          <button type="submit" className="place-order-btn">
            Place Order
          </button>
        </form>
      </div>
    </div>
  );
}

export default Checkout;
