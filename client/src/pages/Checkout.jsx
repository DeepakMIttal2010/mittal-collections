import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FaTag, FaTimes, FaGift, FaTags } from "react-icons/fa";

import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import {
  createOrder,
  verifyRazorpayPayment,
} from "../services/orderService";
import { getAddresses } from "../services/addressService";
import {
  getFirstOrderOffer,
  validateCoupon,
} from "../services/couponService";
import { getSiteSettings } from "../services/settingsService";
import { getProfile } from "../services/authService";
import { getPublicRewardsInfo } from "../services/rewardsService";
import { calculateDeliveryFee } from "../utils/shipping";

// Loaded on-demand at checkout rather than globally in index.html, so
// pages that never reach payment don't pay for it.
let razorpayScriptPromise = null;
const loadRazorpayScript = () => {
  if (window.Razorpay) return Promise.resolve(true);

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  return razorpayScriptPromise;
};

function Checkout() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isLoggedIn, user } = useAuth();

  const { cartItems, totalPrice, bundleInfo, clearCart } = useCart();

  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Razorpay");
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
    codCharge: 50,
  });
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false);
  const [showBundleInfo, setShowBundleInfo] = useState(false);

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
          codCharge: response.settings.codCharge ?? 50,
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
  const codCharge = paymentMethod === "COD" ? shipping.codCharge : 0;
  const discountAmount = appliedCoupon?.discountAmount || 0;

  const sortedShippingTiers = [...shipping.shippingTiers].sort(
    (a, b) => a.maxOrderValue - b.maxOrderValue,
  );

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
    totalPrice +
      deliveryFee +
      codCharge -
      discountAmount -
      bundleInfo.discountAmount -
      pointsDiscount,
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
      toast.success(
        t(`Coupon ${response.code} applied!`, `कूपन ${response.code} लागू हुआ!`),
      );
    } else {
      setCouponError(
        response.message || t("Invalid coupon code", "अमान्य कूपन कोड"),
      );
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError("");
  };

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) {
      toast.error(t("Your cart is empty", "आपका कार्ट खाली है"));
      return;
    }

    if (!selectedAddress) {
      toast.error(t("Please add a delivery address", "कृपया एक डिलीवरी पता जोड़ें"));
      return;
    }

    setPlacing(true);

    const orderItems = cartItems.map((item) => ({
      product: item.productId || item._id,
      name: item.name,
      image: item.image,
      price: item.price,
      quantity: item.quantity,
      size: item.selectedSize || "",
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

    if (!response.success) {
      setPlacing(false);
      toast.error(response.message);
      return;
    }

    if (paymentMethod !== "Razorpay") {
      setPlacing(false);
      toast.success(t("Order placed successfully 🎉", "ऑर्डर सफलतापूर्वक हो गया 🎉"));
      clearCart();
      navigate("/my-orders");
      return;
    }

    const scriptLoaded = await loadRazorpayScript();

    if (!scriptLoaded || !response.razorpayOrder) {
      setPlacing(false);
      // The order already exists (Pending, unpaid) — same state a fresh
      // COD order starts in — so this isn't a failure, just no payment
      // collected yet.
      toast.error(
        t(
          "Order placed, but we couldn't open the payment window. You can pay from My Orders.",
          "ऑर्डर हो गया, लेकिन पेमेंट विंडो नहीं खुल पाई। आप My Orders से पेमेंट कर सकते हैं।",
        ),
      );
      clearCart();
      navigate("/my-orders");
      return;
    }

    const finishRazorpayFlow = (message, isSuccess) => {
      setPlacing(false);
      isSuccess ? toast.success(message) : toast.error(message);
      clearCart();
      navigate("/my-orders");
    };

    const razorpay = new window.Razorpay({
      key: response.razorpayKeyId,
      amount: response.razorpayOrder.amount,
      currency: response.razorpayOrder.currency,
      order_id: response.razorpayOrder.id,
      name: "Mittal Collections",
      description: "Order Payment",
      prefill: {
        name: selectedAddress.fullName,
        contact: selectedAddress.mobile,
        email: user?.email || "",
      },
      theme: { color: "#1e3a8a" },
      handler: async (razorpayResponse) => {
        const verifyResponse = await verifyRazorpayPayment({
          orderId: response.order._id,
          razorpay_order_id: razorpayResponse.razorpay_order_id,
          razorpay_payment_id: razorpayResponse.razorpay_payment_id,
          razorpay_signature: razorpayResponse.razorpay_signature,
        });

        finishRazorpayFlow(
          verifyResponse.success
            ? t("Payment successful — order placed 🎉", "पेमेंट सफल — ऑर्डर हो गया 🎉")
            : t(
                "Order placed, but payment verification failed. Please contact support.",
                "ऑर्डर हो गया, लेकिन पेमेंट verify नहीं हो पाया। कृपया सपोर्ट से संपर्क करें।",
              ),
          verifyResponse.success,
        );
      },
      modal: {
        ondismiss: () => {
          finishRazorpayFlow(
            t(
              "Order placed — payment not completed. You can pay from My Orders.",
              "ऑर्डर हो गया — पेमेंट पूरा नहीं हुआ। आप My Orders से पेमेंट कर सकते हैं।",
            ),
            false,
          );
        },
      },
    });

    // Razorpay's own modal stays open after a failed attempt so the
    // customer can retry with a different method — only show the error
    // here, don't navigate away yet. modal.ondismiss (fired once the
    // customer actually closes the modal) handles leaving the page.
    razorpay.on("payment.failed", () => {
      toast.error(
        t(
          "Payment failed — you can try another payment method.",
          "पेमेंट नहीं हो पाया — आप कोई और पेमेंट तरीका आज़मा सकते हैं।",
        ),
      );
    });

    setPlacing(false);
    razorpay.open();
  };

  if (cartItems.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500 mb-4">{t("Your cart is empty.", "आपका कार्ट खाली है।")}</p>
        <Link
          to="/"
          className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
        >
          {t("Continue Shopping", "शॉपिंग जारी रखें")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        {t("Place Your Order", "अपना ऑर्डर करें")}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: delivery + payment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery address */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold text-slate-800">
                {addressesLoading
                  ? t("Loading address...", "पता लोड हो रहा है...")
                  : selectedAddress
                    ? t(
                        `Delivering to ${selectedAddress.fullName}`,
                        `${selectedAddress.fullName} को डिलीवर होगा`,
                      )
                    : t("No delivery address", "कोई डिलीवरी पता नहीं")}
              </h2>

              {addresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddressPicker((v) => !v)}
                  className="text-sm text-blue-700 hover:underline shrink-0"
                >
                  {t("Change", "बदलें")}
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
                {t("Phone number", "फ़ोन नंबर")}: {selectedAddress.mobile}
              </p>
            )}

            {!addressesLoading && addresses.length === 0 && (
              <div className="mt-3">
                <p className="text-sm text-slate-500 mb-3">
                  {t("You don't have a saved address yet.", "आपने अभी तक कोई पता सेव नहीं किया है।")}
                </p>
                <Link
                  to="/addresses/add?redirect=/checkout"
                  className="inline-block bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full px-5 py-2.5 transition-colors"
                >
                  {t("Add an address", "एक पता जोड़ें")}
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
                      {t("Phone number", "फ़ोन नंबर")}: {addr.mobile}
                    </span>
                  </label>
                ))}

                <Link
                  to="/addresses/add?redirect=/checkout"
                  className="inline-block text-sm text-blue-700 hover:underline"
                >
                  {t("+ Add a new address", "+ नया पता जोड़ें")}
                </Link>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h2 className="font-semibold text-slate-800 mb-3">
              {t("Payment method", "पेमेंट का तरीका")}
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
                  {t("Cash on Delivery", "कैश ऑन डिलीवरी")}
                  {shipping.codCharge > 0 && (
                    <span className="text-slate-400">
                      {" "}
                      (+₹{shipping.codCharge} {t("COD charge", "COD चार्ज")})
                    </span>
                  )}
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
                  {t("Razorpay (Cards / UPI / Netbanking)", "Razorpay (कार्ड / UPI / नेटबैंकिंग)")}
                </span>
              </label>
            </div>

            {paymentMethod === "COD" && codCharge > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-4">
                <p className="text-xs text-amber-800">
                  {t(
                    `A ₹${codCharge} COD handling charge applies to Cash on Delivery orders — pick Razorpay to avoid it.`,
                    `कैश ऑन डिलीवरी ऑर्डर पर ₹${codCharge} COD हैंडलिंग चार्ज लगता है — इससे बचने के लिए Razorpay चुनें।`,
                  )}
                </p>
              </div>
            )}
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
              {placing ? t("Placing Order...", "ऑर्डर हो रहा है...") : t("Place Order", "ऑर्डर करें")}
            </button>

            {bundleInfo.eligible ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5 mt-4">
                <span className="text-sm font-medium text-indigo-800 flex items-center gap-1.5">
                  <FaTags className="text-xs" />
                  {t(
                    `Extra ${bundleInfo.discountPercent}% OFF Applied!`,
                    `अतिरिक्त ${bundleInfo.discountPercent}% छूट लागू हुई!`,
                  )}
                </span>
                <span className="text-xs text-indigo-700">
                  {t(
                    "Complete the Look bundle discount applied to your order.",
                    "आपके ऑर्डर पर 'Complete the Look' बंडल छूट लागू हुई है।",
                  )}
                </span>
              </div>
            ) : (
              bundleInfo.missingCategoryLabel && (
                <Link
                  to={`/category/${bundleInfo.missingCategorySlug}`}
                  className="block bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 mt-4 hover:bg-blue-100 transition-colors"
                >
                  <span className="text-sm font-medium text-blue-800 flex items-center gap-1.5">
                    <FaTags className="text-xs" />
                    {t(
                      `Get Extra ${bundleInfo.discountPercent}% OFF!`,
                      `अतिरिक्त ${bundleInfo.discountPercent}% छूट पाएं!`,
                    )}
                  </span>
                  <span className="text-xs text-blue-700 block">
                    {t(
                      `Add ${bundleInfo.missingCategoryLabel} to your cart and unlock an additional ${bundleInfo.discountPercent}% OFF.`,
                      `अपने कार्ट में ${bundleInfo.missingCategoryLabel} जोड़ें और अतिरिक्त ${bundleInfo.discountPercent}% छूट पाएं।`,
                    )}
                  </span>
                  <span className="text-xs font-semibold text-blue-800">
                    {t(
                      `Shop ${bundleInfo.missingCategoryLabel} →`,
                      `${bundleInfo.missingCategoryLabel} खरीदें →`,
                    )}
                  </span>
                </Link>
              )
            )}

            <div className="border-t border-slate-100 mt-4 pt-4">
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                  <span className="text-green-700 font-medium flex items-center gap-1.5">
                    <FaTag className="text-xs" />
                    {t(`${appliedCoupon.code} applied`, `${appliedCoupon.code} लागू है`)}
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-green-700 hover:text-green-900"
                    aria-label={t("Remove coupon", "कूपन हटाएं")}
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
                        {t(
                          `You're eligible for ${firstOrderOffer.discountValue}% off (up to ₹${firstOrderOffer.maxDiscount})`,
                          `आप ${firstOrderOffer.discountValue}% छूट के योग्य हैं (₹${firstOrderOffer.maxDiscount} तक)`,
                        )}
                      </span>
                      <span className="text-xs text-amber-700">
                        {t(
                          `Tap to apply code ${firstOrderOffer.code}`,
                          `कोड ${firstOrderOffer.code} लागू करने के लिए टैप करें`,
                        )}
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
                      placeholder={t("Coupon code", "कूपन कोड")}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleApplyCoupon()}
                      disabled={checkingCoupon || !couponInput.trim()}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {checkingCoupon ? "..." : t("Apply", "लागू करें")}
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
                    {t("Use loyalty points", "लॉयल्टी पॉइंट्स इस्तेमाल करें")}{" "}
                    <span className="text-slate-400">
                      ({availablePoints} {t("available", "उपलब्ध")})
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
                      <span>{redeemPoints} {t("points", "पॉइंट्स")}</span>
                      <span>
                        -₹{redeemPoints * loyaltyRules.redeemValue} {t("off", "छूट")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-slate-100 mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>{t("Items", "आइटम")}:</span>
                <span>₹{totalPrice}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <button
                  type="button"
                  onClick={() => setShowDeliveryInfo((prev) => !prev)}
                  className="text-blue-600 hover:underline"
                >
                  {t("Delivery*", "डिलीवरी*")}:
                </button>
                <span>{deliveryFee === 0 ? t("FREE", "फ्री") : `₹${deliveryFee}`}</span>
              </div>

              {showDeliveryInfo && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1.5">
                  <p className="font-semibold text-slate-700">
                    {t("Delivery charges", "डिलीवरी शुल्क")}
                  </p>

                  {sortedShippingTiers.length > 0 ? (
                    sortedShippingTiers.map((tier) => (
                      <div
                        key={tier._id || tier.maxOrderValue}
                        className="flex justify-between"
                      >
                        <span>{t(`Orders under ₹${tier.maxOrderValue}`, `₹${tier.maxOrderValue} से कम के ऑर्डर पर`)}</span>
                        <span>₹{tier.fee}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between">
                      <span>
                        {t(
                          `Orders under ₹${shipping.freeShippingThreshold}`,
                          `₹${shipping.freeShippingThreshold} से कम के ऑर्डर पर`,
                        )}
                      </span>
                      <span>₹{shipping.deliveryFee}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-green-700 font-medium">
                    <span>
                      {t(
                        `Orders ₹${shipping.freeShippingThreshold} and above`,
                        `₹${shipping.freeShippingThreshold} और उससे ज़्यादा के ऑर्डर पर`,
                      )}
                    </span>
                    <span>{t("FREE", "फ्री")}</span>
                  </div>
                </div>
              )}

              {codCharge > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{t("COD charge", "COD चार्ज")}:</span>
                  <span>₹{codCharge}</span>
                </div>
              )}

              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>
                    {t("Discount", "छूट")} ({appliedCoupon.code}):
                  </span>
                  <span>-₹{discountAmount}</span>
                </div>
              )}
              {bundleInfo.discountAmount > 0 && (
                <>
                  <div className="flex justify-between text-green-600">
                    <button
                      type="button"
                      onClick={() => setShowBundleInfo((prev) => !prev)}
                      className="hover:underline"
                    >
                      {t("Bundle discount", "बंडल छूट")} ({bundleInfo.discountPercent}%)*:
                    </button>
                    <span>-₹{bundleInfo.discountAmount}</span>
                  </div>

                  {showBundleInfo && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 space-y-1.5">
                      <p className="font-semibold">{t("Items in this bundle", "इस बंडल में आइटम")}</p>
                      <p className="text-green-700">
                        {t(
                          "*Only the best-matching pair gets the discount — other items in your order aren't discounted twice, even if they'd also qualify for a different bundle.",
                          "*सिर्फ सबसे अच्छे मैच वाली जोड़ी पर छूट मिलती है — बाकी आइटम पर दोबारा छूट नहीं मिलती, भले ही वो किसी दूसरे बंडल के लिए योग्य हों।",
                        )}
                      </p>
                      {bundleInfo.eligibleItems.map((item) => (
                        <div key={item._id} className="flex justify-between">
                          <span>
                            {item.name} × {item.quantity}
                          </span>
                          <span>₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-semibold border-t border-green-200 pt-1.5">
                        <span>{t("Eligible subtotal", "योग्य सबटोटल")}</span>
                        <span>₹{bundleInfo.eligibleSubtotal}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>{t(`${bundleInfo.discountPercent}% off`, `${bundleInfo.discountPercent}% छूट`)}</span>
                        <span>-₹{bundleInfo.discountAmount}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {pointsDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>
                    {t("Points redeemed", "पॉइंट्स इस्तेमाल हुए")} ({redeemPoints}):
                  </span>
                  <span>-₹{pointsDiscount}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 mt-3 pt-3 flex justify-between">
              <span className="font-bold text-slate-900">{t("Order Total", "ऑर्डर टोटल")}:</span>
              <span className="font-bold text-slate-900">₹{orderTotal}</span>
            </div>

            {pointsPreview > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 mt-3">
                <FaGift />
                {t(
                  `You'll earn ${pointsPreview} loyalty points on this order`,
                  `इस ऑर्डर पर आपको ${pointsPreview} लॉयल्टी पॉइंट्स मिलेंगे`,
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
