import { createContext, useContext, useEffect, useState } from "react";

import { toast } from "react-toastify";

import { syncCart } from "../services/cartService";
import { getSiteSettings } from "../services/settingsService";
import { useAuth } from "./AuthContext";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => {
    const savedCart = localStorage.getItem("cartItems");
    return savedCart ? JSON.parse(savedCart) : [];
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const { isLoggedIn } = useAuth();

  // "Complete the Look" bundle rules — admin-managed. Buying from both
  // categories in an active rule unlocks that rule's discount automatically
  // at checkout, no coupon needed. This is only a live preview for display —
  // the server (bundleDiscount.js) independently re-derives category
  // membership from the DB at order time, so it can't be spoofed here.
  const [bundleRules, setBundleRules] = useState([]);

  useEffect(() => {
    getSiteSettings().then((response) => {
      if (response.success) {
        setBundleRules(
          (response.settings.bundleRules || []).filter(
            (rule) => rule.isActive,
          ),
        );
      }
    });
  }, []);

  useEffect(() => {
    localStorage.setItem("cartItems", JSON.stringify(cartItems));
  }, [cartItems]);

  // Mirror the cart to the backend (debounced) so an abandoned-cart
  // reminder can be sent later — purely a background sync, not used
  // to render anything here.
  useEffect(() => {
    if (!isLoggedIn) return;

    const timeout = setTimeout(() => {
      syncCart(cartItems);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [cartItems, isLoggedIn]);

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  // variant, when given, is one entry from product.variants (a size with
  // its own price/stock) — see ProductDetails.jsx's size selector. Each
  // size becomes its own cart line (distinct _id) since price/stock
  // differ per size, but the real product ObjectId is kept as productId
  // so checkout still submits a valid order item.
  const addToCart = (product, qty = 1, variant = null) => {
    const lineId = variant ? `${product._id}::${variant.size}` : product._id;
    const price = variant ? variant.price : product.price;
    const oldPrice = variant ? variant.oldPrice : product.oldPrice;
    const stock = variant ? variant.stock : product.stock;

    const existingItem = cartItems.find((item) => item._id === lineId);

    if (existingItem) {
      const newQuantity = Math.min(existingItem.quantity + qty, stock);

      if (newQuantity <= existingItem.quantity) {
        toast.error(`Only ${stock} in stock`);
        openCart();
        return;
      }

      setCartItems(
        cartItems.map((item) =>
          item._id === lineId
            ? {
                ...item,
                quantity: newQuantity,
              }
            : item,
        ),
      );

      toast.info("Product quantity updated");
    } else {
      if (stock <= 0) {
        toast.error("Out of stock");
        return;
      }

      setCartItems([
        ...cartItems,
        {
          ...product,
          _id: lineId,
          productId: product._id,
          price,
          oldPrice,
          stock,
          selectedSize: variant?.size || "",
          quantity: Math.min(qty, stock),
        },
      ]);

      toast.success("Product added to cart 🛒");
    }

    openCart();
  };

  const removeFromCart = (id) => {
    setCartItems(cartItems.filter((item) => item._id !== id));

    toast.error("Product removed from cart");
  };

  const increaseQty = (id) => {
    const item = cartItems.find((cartItem) => cartItem._id === id);

    if (item && item.quantity >= item.stock) {
      toast.error(`Only ${item.stock} in stock`);
      return;
    }

    setCartItems(
      cartItems.map((cartItem) =>
        cartItem._id === id
          ? {
              ...cartItem,
              quantity: cartItem.quantity + 1,
            }
          : cartItem,
      ),
    );
  };

  const decreaseQty = (id) => {
    setCartItems(
      cartItems.map((item) =>
        item._id === id
          ? {
              ...item,
              quantity: item.quantity > 1 ? item.quantity - 1 : 1,
            }
          : item,
      ),
    );
  };

  const clearCart = () => {
    setCartItems([]);
    toast.warning("Cart cleared");
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const totalPrice = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const presentCategoryIds = new Set(
    cartItems.map((item) => item.category?._id).filter(Boolean),
  );

  const matchedRule = bundleRules
    .filter(
      (rule) =>
        presentCategoryIds.has(rule.categoryA?._id) &&
        presentCategoryIds.has(rule.categoryB?._id),
    )
    .sort((a, b) => b.discountPercent - a.discountPercent)[0];

  // No full match yet — find a rule that's one category away, to nudge
  // the customer toward completing it (prefer the highest-value nudge).
  const nudgeRule = matchedRule
    ? null
    : bundleRules
        .filter((rule) => {
          const hasA = presentCategoryIds.has(rule.categoryA?._id);
          const hasB = presentCategoryIds.has(rule.categoryB?._id);
          return hasA !== hasB;
        })
        .sort((a, b) => b.discountPercent - a.discountPercent)[0];

  const nudgeMissingCategory = nudgeRule
    ? presentCategoryIds.has(nudgeRule.categoryA?._id)
      ? nudgeRule.categoryB
      : nudgeRule.categoryA
    : null;

  // Discount applies only to items from the two matched categories, not
  // the whole cart — an unrelated item (e.g. a towel) riding along in the
  // same cart must not get discounted just because a bundle unlocked.
  const ruleCategoryIds = matchedRule
    ? new Set([matchedRule.categoryA?._id, matchedRule.categoryB?._id])
    : null;

  const bundleEligibleItems = ruleCategoryIds
    ? cartItems.filter((item) => ruleCategoryIds.has(item.category?._id))
    : [];

  const bundleEligibleSubtotal = bundleEligibleItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const bundleInfo = {
    eligible: Boolean(matchedRule),
    discountPercent: matchedRule?.discountPercent || nudgeRule?.discountPercent || 0,
    discountAmount: matchedRule
      ? Math.round((bundleEligibleSubtotal * matchedRule.discountPercent) / 100)
      : 0,
    eligibleItems: bundleEligibleItems,
    eligibleSubtotal: bundleEligibleSubtotal,
    missingCategoryLabel: nudgeMissingCategory?.name || null,
    missingCategorySlug: nudgeMissingCategory?.slug || null,
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        increaseQty,
        decreaseQty,
        clearCart,
        totalItems,
        totalPrice,
        bundleInfo,
        isCartOpen,
        openCart,
        closeCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
