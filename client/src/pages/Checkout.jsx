import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FaTag, FaTimes, FaGift } from "react-icons/fa";

import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { createOrder } from "../services/orderService";
import { getAddresses } from "../services/addressService";
import {
  getFirstOrderOffer,
  validateCoupon,
} from "../services/couponService";
import { getSiteSettings } from "../services/settingsService";
import { getProfile } from "../services/authService";
import { getPublicRewardsInfo } from "../services/rewardsService";
import { calculateDeliveryFee } from "../utils/shipping";

function Checkout() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  const { cartItems, totalPrice, clearCart } = useCart();

  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [placing, setPlacing] = useState(false);

  const [firstOrderOffer, setFirstOrderOffer] = useState(null);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const [availablePoints, setAvailablePoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [loyaltyRules, setLoyaltyRules] = useState({
    redeemValue: 1,
    maxRedeemPercent: 0.5,
    minRedeemPoints: 50,
  });

  const [shipping, setShipping] = useState({
    freeShippingThreshold: 499,
    deliveryFee: 49,
    shippingTiers: [],
  });

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/checkout");
    }
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    const loadShippingSettings = async () => {
      const response = await getSiteSettings();

      if (response.success) {
        setShipping({
          freeShippingThreshold: response.settings.freeShippingThreshold ?? 499,
          deliveryFee: response.settings.deliveryFee ?? 49,
          shippingTiers: response.settings.shippingTiers || [],
        });
      }
    };

    loadShippingSettings();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    const loadOffer = async () => {
      const response = await getFirstOrderOffer();

      if (response.success && response.coupon) {
        setFirstOrderOffer(response.coupon);
      }
    };

    loadOffer();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const loadPoints = async () => {
      const response = await getProfile();

      if (response.success) {
        setAvailablePoints(response.user.loyaltyPoints || 0);
      }
    };

    loadPoints();
  }, [isLoggedIn]);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setLoyaltyRules(response.loyalty);
    });
  }, []);

  useEffect(() => {
    const loadAddresses = async () => {
      const data = await getAddresses();

      if (data.success) {
        setAddresses(data.addresses);
        const defaultAddress = data.addresses.find((a) => a.isDefault);
        setSelectedAddressId(
          (defaultAddress || data.addresses[0])?._id || "",
        );
      }

      setAddressesLoading(false);
    };

    loadAddresses();
  }, []);

  const selectedAddress = addresses.find((a) => a._id === selectedAddressId);

  const deliveryFee =
    totalPrice === 0 ? 0 : calculateDeliveryFee(totalPrice, shipping);
  const discountAmount = appliedCoupon?.discountAmount || 0;

  const maxRedeemablePoints = Math.max(
    0,
    Math.min(
      availablePoints,
      Math.floor(
        (totalPrice * loyaltyRules.maxRedeemPercent) /
          loyaltyRules.redeemValue,
      ),
    ),
  );
  const pointsDiscount = usePoints
    ? redeemPoints * loyaltyRules.redeemValue
    : 0;

  const orderTotal = Math.max(
    totalPrice + deliveryFee - discountAmount - pointsDiscount,
    0,
  );

  const pointsPreview = loyaltyRules.earnRate
    ? Math.floor(orderTotal / loyaltyRules.earnRate)
    : 0;

  const handleTogglePoints = (checked) => {
    setUsePoints(checked);
    setRedeemPoints(checked ? maxRedeemablePoints : 0);
  };

  const handleApplyCoupon = async (code) => {
    const codeToApply = (code || couponInput).trim();

    if (!codeToApply) return;

    setCheckingCoupon(true);
    setCouponError("");

    const response = await validateCoupon(codeToApply, totalPrice);

    setCheckingCoupon(false);

    if (response.success) {
      setAppliedCoupon({
        code: response.code,
        discountAmount: response.discountAmount,
      });
      setCouponInput(response.code);
      toast.success(`Coupon ${response.code} applied!`);
    } else {
      setCouponError(response.message || "Invalid coupon code");
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError("");
  };

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (!selectedAddress) {
      toast.error("Please add a delivery address");
      return;
    }

    setPlacing(true);

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
        fullName: selectedAddress.fullName,
        mobile: selectedAddress.mobile,
        address: selectedAddress.unit
          ? `${selectedAddress.address}, ${selectedAddress.unit}`
          : selectedAddress.address,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
      },
      paymentMethod,
      couponCode: appliedCoupon?.code || undefined,
      redeemPoints: usePoints ? redeemPoints : undefined,
    });

    setPlacing(false);

    if (response.success) {
      toast.success("Order placed successfully 🎉");
      clearCart();
      navigate("/my-orders");
    } else {
      toast.error(response.message);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500 mb-4">Your cart is empty.</p>
        <Link
          to="/"
          className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        Place Your Order
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: delivery + payment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery address */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold text-slate-800">
                {addressesLoading
                  ? "Loading address..."
                  : selectedAddress
                    ? `Delivering to ${selectedAddress.fullName}`
                    : "No delivery address"}
              </h2>

              {addresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddressPicker((v) => !v)}
                  className="text-sm text-blue-700 hover:underline shrink-0"
                >
                  Change
                </button>
              )}
            </div>

            {selectedAddress && (
              <p className="text-sm text-slate-600 mt-2">
                {selectedAddress.address}
                {selectedAddress.unit ? `, ${selectedAddress.unit}` : ""},{" "}
                {selectedAddress.city}, {selectedAddress.state}{" "}
                {selectedAddress.pincode}, {selectedAddress.country}
                <br />
                Phone number: {selectedAddress.mobile}
              </p>
            )}

            {!addressesLoading && addresses.length === 0 && (
              <div className="mt-3">
                <p className="text-sm text-slate-500 mb-3">
                  You don&apos;t have a saved address yet.
                </p>
                <Link
                  to="/addresses/add?redirect=/checkout"
                  className="inline-block bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full px-5 py-2.5 transition-colors"
                >
                  Add an address
                </Link>
              </div>
            )}

            {showAddressPicker && addresses.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                {addresses.map((addr) => (
                  <label
                    key={addr._id}
                    className="flex items-start gap-3 border border-slate-200 rounded-lg p-3 cursor-pointer has-[:checked]:border-amber-500"
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={selectedAddressId === addr._id}
                      onChange={() => setSelectedAddressId(addr._id)}
                      className="mt-1 accent-blue-900"
                    />
                    <span className="text-sm text-slate-700">
                      <span className="block font-medium text-slate-800">
                        {addr.fullName}
                      </span>
                      {addr.address}
                      {addr.unit ? `, ${addr.unit}` : ""}, {addr.city},{" "}
                      {addr.state} {addr.pincode}
                      <br />
                      Phone number: {addr.mobile}
                    </span>
                  </label>
                ))}

                <Link
                  to="/addresses/add?redirect=/checkout"
                  className="inline-block text-sm text-blue-700 hover:underline"
                >
                  + Add a new address
                </Link>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h2 className="font-semibold text-slate-800 mb-3">
              Payment method
            </h2>

            <div className="space-y-3">
              <label className="flex items-center gap-3 border border-slate-200 rounded-lg p-3 cursor-pointer has-[:checked]:border-amber-500">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={paymentMethod === "COD"}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="accent-blue-900"
                />
                <span className="text-sm text-slate-700">
                  Cash on Delivery
                </span>
              </label>

              <label className="flex items-center gap-3 border border-slate-200 rounded-lg p-3 cursor-pointer has-[:checked]:border-amber-500">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="Razorpay"
                  checked={paymentMethod === "Razorpay"}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="accent-blue-900"
                />
                <span className="text-sm text-slate-700">
                  Razorpay (Cards / UPI / Netbanking)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Right: order summary */}
        <div>
          <div className="border border-slate-200 rounded-xl p-5 bg-white sticky top-4">
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={placing}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-full py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {placing ? "Placing Order..." : "Place Order"}
            </button>

            <div className="border-t border-slate-100 mt-4 pt-4">
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                  <span className="text-green-700 font-medium flex items-center gap-1.5">
                    <FaTag className="text-xs" />
                    {appliedCoupon.code} applied
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-green-700 hover:text-green-900"
                    aria-label="Remove coupon"
                  >
                    <FaTimes className="text-xs" />
                  </button>
                </div>
              ) : (
                <>
                  {firstOrderOffer && (
                    <button
                      type="button"
                      onClick={() => handleApplyCoupon(firstOrderOffer.code)}
                      disabled={checkingCoupon}
                      className="w-full text-left bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-3 hover:bg-amber-100 transition-colors"
                    >
                      <span className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
                        <FaTag className="text-xs" />
                        You&apos;re eligible for {firstOrderOffer.discountValue}
                        % off (up to ₹{firstOrderOffer.maxDiscount})
                      </span>
                      <span className="text-xs text-amber-700">
                        Tap to apply code {firstOrderOffer.code}
                      </span>
                    </button>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) =>
                        setCouponInput(e.target.value.toUpperCase())
                      }
                      placeholder="Coupon code"
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleApplyCoupon()}
                      disabled={checkingCoupon || !couponInput.trim()}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {checkingCoupon ? "..." : "Apply"}
                    </button>
                  </div>
                  {couponError && (
                    <p className="text-xs text-red-600 mt-1.5">
                      {couponError}
                    </p>
                  )}
                </>
              )}
            </div>

            {availablePoints >= loyaltyRules.minRedeemPoints && (
              <div className="border-t border-slate-100 mt-4 pt-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-slate-700">
                    Use loyalty points{" "}
                    <span className="text-slate-400">
                      ({availablePoints} available)
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={usePoints}
                    onChange={(e) => handleTogglePoints(e.target.checked)}
                  />
                </label>

                {usePoints && (
                  <div className="mt-2">
                    <input
                      type="range"
                      min={0}
                      max={maxRedeemablePoints}
                      value={redeemPoints}
                      onChange={(e) => setRedeemPoints(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>{redeemPoints} points</span>
                      <span>
                        -₹{redeemPoints * loyaltyRules.redeemValue} off
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-slate-100 mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Items:</span>
                <span>₹{totalPrice}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery:</span>
                <span>{deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({appliedCoupon.code}):</span>
                  <span>-₹{discountAmount}</span>
                </div>
              )}
              {pointsDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Points redeemed ({redeemPoints}):</span>
                  <span>-₹{pointsDiscount}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 mt-3 pt-3 flex justify-between">
              <span className="font-bold text-slate-900">Order Total:</span>
              <span className="font-bold text-slate-900">₹{orderTotal}</span>
            </div>

            {pointsPreview > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 mt-3">
                <FaGift />
                You&apos;ll earn {pointsPreview} loyalty points on this order
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
