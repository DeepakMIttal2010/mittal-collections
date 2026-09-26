import { useEffect, useRef, useState } from "react";
import { imgUrl } from "../services/api";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FaTrash, FaPlus, FaMinus, FaGift, FaTags } from "react-icons/fa";

import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getPublicRewardsInfo } from "../services/rewardsService";
import { getSiteSettings } from "../services/settingsService";
import { getProductById } from "../services/productService";
import { calculateDeliveryFee } from "../utils/shipping";
import Seo from "../components/Seo";
import "./Cart.css";

function Cart() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const {
    cartItems,
    increaseQty,
    decreaseQty,
    removeFromCart,
    clearCart,
    totalItems,
    totalPrice,
    bundleInfo,
    reconcileCartItem,
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

  // addToCart only ever copies price/stock into the line item at
  // add-time — nothing revisits that snapshot for as long as the item
  // sits in the cart, so a price change or a stock drop since adding was
  // otherwise invisible until checkout rejected an unfulfillable
  // quantity with a confusing error. Reconciles once against live
  // product data whenever the cart page is opened with items already in
  // it (deliberately not on every cartItems change, which would refetch
  // on every quantity click).
  const reconciledRef = useRef(false);

  useEffect(() => {
    if (reconciledRef.current || cartItems.length === 0) return;
    reconciledRef.current = true;

    const itemsToCheck = cartItems;

    (async () => {
      let priceChanged = false;
      let stockReduced = false;

      for (const item of itemsToCheck) {
        const response = await getProductById(item.productId);
        const product = response.success ? response.product : null;

        // getProductById already 404s (success: false) for a soft-deleted,
        // deactivated, or offline-visibility product — no separate
        // isActive check needed here.
        if (!product) {
          removeFromCart(item._id);
          toast.info(
            t(
              `${item.name} is no longer available and was removed from your cart`,
              `${item.name} अब उपलब्ध नहीं है और कार्ट से हटा दिया गया`,
            ),
          );
          continue;
        }

        const variant = item.selectedSize
          ? product.variants?.find((v) => v.size === item.selectedSize)
          : null;

        if (item.selectedSize && !variant) {
          removeFromCart(item._id);
          toast.info(
            t(
              `${item.name} (${item.selectedSize}) is no longer available and was removed from your cart`,
              `${item.name} (${item.selectedSize}) अब उपलब्ध नहीं है और कार्ट से हटा दिया गया`,
            ),
          );
          continue;
        }

        const liveStock = variant ? variant.stock : product.stock;

        if (liveStock <= 0) {
          removeFromCart(item._id);
          toast.info(
            t(
              `${item.name} is now out of stock and was removed from your cart`,
              `${item.name} अब स्टॉक में नहीं है और कार्ट से हटा दिया गया`,
            ),
          );
          continue;
        }

        const livePrice = variant ? variant.price : product.price;
        const liveOldPrice = variant ? variant.oldPrice : product.oldPrice;
        const cappedQuantity = Math.min(item.quantity, liveStock);

        const updates = {};
        if (livePrice !== item.price) {
          updates.price = livePrice;
          updates.oldPrice = liveOldPrice;
          priceChanged = true;
        }
        if (liveStock !== item.stock) updates.stock = liveStock;
        if (cappedQuantity !== item.quantity) {
          updates.quantity = cappedQuantity;
          stockReduced = true;
        }

        if (Object.keys(updates).length > 0) {
          reconcileCartItem(item._id, updates);
        }
      }

      if (priceChanged) {
        toast.info(
          t(
            "Some prices in your cart were updated to reflect the latest price",
            "आपके कार्ट में कुछ कीमतें नवीनतम कीमत दर्शाने के लिए अपडेट हुई हैं",
          ),
        );
      }
      if (stockReduced) {
        toast.info(
          t(
            "Some quantities in your cart were adjusted due to limited stock",
            "सीमित स्टॉक के कारण आपके कार्ट में कुछ मात्राएं समायोजित की गई हैं",
          ),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {/* noindex — cart contents are entirely per-visitor/localStorage,
            so there's nothing unique here for a crawler to index, same
            reasoning as Compare.jsx's noindex. */}
        <Seo title="Your Cart" description="Review the items in your shopping cart at Mittal Collections." noindex />

        <h2>{t("Your Cart is Empty", "आपका कार्ट खाली है")}</h2>

        <p>
          {t(
            "Looks like you haven't added any products yet.",
            "लगता है आपने अभी तक कोई प्रोडक्ट नहीं जोड़ा है।",
          )}
        </p>

        <Link to="/" className="shop-btn">
          {t("Continue Shopping", "शॉपिंग जारी रखें")}
        </Link>
      </div>
    );
  }

  return (
    <section className="cart-page">
      <Seo title="Your Cart" description="Review the items in your shopping cart at Mittal Collections." noindex />

      <div className="container">
        <h2 className="cart-title">{t("Shopping Cart", "शॉपिंग कार्ट")}</h2>

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
                    {item.selectedSize
                      ? ` · ${t("Size", "साइज़")}: ${item.selectedSize}`
                      : ""}
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
            <h3>{t("Order Summary", "ऑर्डर सारांश")}</h3>

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
                  {t(
                    `Extra ${bundleInfo.discountPercent}% OFF Applied!`,
                    `अतिरिक्त ${bundleInfo.discountPercent}% छूट लागू हुई!`,
                  )}
                </div>
                <div style={{ color: "#4338ca", fontSize: "0.8rem" }}>
                  {t(
                    "Complete the Look bundle discount applied to your order.",
                    "आपके ऑर्डर पर 'Complete the Look' बंडल छूट लागू हुई है।",
                  )}
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
                    {t(
                      `Get Extra ${bundleInfo.discountPercent}% OFF!`,
                      `अतिरिक्त ${bundleInfo.discountPercent}% छूट पाएं!`,
                    )}
                  </div>
                  <div style={{ color: "#1d4ed8", fontSize: "0.8rem" }}>
                    {t(
                      `Add ${bundleInfo.missingCategoryLabel} to your cart and unlock an additional ${bundleInfo.discountPercent}% OFF.`,
                      `अपने कार्ट में ${bundleInfo.missingCategoryLabel} जोड़ें और अतिरिक्त ${bundleInfo.discountPercent}% छूट पाएं।`,
                    )}
                  </div>
                  <div style={{ color: "#1e40af", fontSize: "0.8rem", fontWeight: 700 }}>
                    {t(
                      `Shop ${bundleInfo.missingCategoryLabel} →`,
                      `${bundleInfo.missingCategoryLabel} खरीदें →`,
                    )}
                  </div>
                </Link>
              )
            )}

            <div className="summary-row">
              <span>{t("Total Items", "कुल आइटम")}</span>
              <span>{totalItems}</span>
            </div>

            <div className="summary-row">
              <span>{t("Subtotal", "सबटोटल")}</span>
              <span>₹{totalPrice}</span>
            </div>

            <div className="summary-row">
              <span>{t("Shipping*", "शिपिंग*")}</span>
              <span>{deliveryFee === 0 ? t("FREE", "फ्री") : `₹${deliveryFee}`}</span>
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
                    {t(
                      `Bundle discount (${bundleInfo.discountPercent}%)*`,
                      `बंडल छूट (${bundleInfo.discountPercent}%)*`,
                    )}
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
                      {t("Items in this bundle", "इस बंडल में आइटम")}
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
                      <span>{t("Eligible subtotal", "योग्य सबटोटल")}</span>
                      <span>₹{bundleInfo.eligibleSubtotal}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontWeight: 700,
                      }}
                    >
                      <span>{t(`${bundleInfo.discountPercent}% off`, `${bundleInfo.discountPercent}% छूट`)}</span>
                      <span>-₹{bundleInfo.discountAmount}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <hr />

            <div className="summary-row total">
              <span>{t("Total", "कुल")}</span>
              <span>₹{orderTotal}</span>
            </div>

            <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "8px" }}>
              {t(
                "*Shipping varies by delivery address and order value.",
                "*शिपिंग डिलीवरी पते और ऑर्डर वैल्यू के अनुसार अलग हो सकती है।",
              )}
              {bundleInfo.discountAmount > 0 &&
                t(
                  " *Bundle discount applies to the best-matching pair only — other items aren't discounted twice.",
                  " *बंडल छूट सिर्फ सबसे अच्छे मैच वाली जोड़ी पर लागू होती है — बाकी आइटम पर दोबारा छूट नहीं मिलती।",
                )}
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
                {t(
                  `You'll earn ${pointsPreview} loyalty points on this order`,
                  `इस ऑर्डर पर आपको ${pointsPreview} लॉयल्टी पॉइंट्स मिलेंगे`,
                )}
              </p>
            )}

            <button
              type="button"
              // CartDrawer.jsx already pre-checks auth before ever
              // navigating to Checkout, so a guest there goes straight
              // to /login with no wasted hop -- this page's own CTA was
              // a plain <Link to="/checkout"> with no such check, so a
              // guest landed on Checkout, saw it fully mount, and only
              // then got redirected by its own effect. Same pre-check
              // here removes that page-flash and matches the drawer.
              onClick={() =>
                navigate(isLoggedIn ? "/checkout" : "/login?redirect=/checkout")
              }
              className="checkout-btn"
            >
              {t("Proceed to Checkout", "चेकआउट पर जाएं")}
            </button>

            <button className="clear-btn" onClick={clearCart}>
              {t("Clear Cart", "कार्ट खाली करें")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Cart;
