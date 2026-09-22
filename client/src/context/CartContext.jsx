import { createContext, useContext, useEffect, useRef, useState } from "react";

import { toast } from "react-toastify";

import { syncCart, syncGuestCart, mergeGuestCart } from "../services/cartService";
import { getSiteSettings } from "../services/settingsService";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";
import { getVisitorId } from "../utils/visitorId";
import { readJsonFromStorage } from "../utils/safeLocalStorage";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() =>
    readJsonFromStorage("cartItems", []),
  );

  const [isCartOpen, setIsCartOpen] = useState(false);
  const { isLoggedIn, user } = useAuth();
  const { t } = useLanguage();

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

  // Once right after login, drop the now-redundant guest cart snapshot
  // (see mergeGuestCart's own comment) — the actual cart contents don't
  // need merging, they're already the same localStorage state before
  // and after login, but without this the guest-keyed snapshot lingers
  // forever as a duplicate in admin's product-engagement/abandoned-cart
  // reports. Idempotent, so re-running on every login is harmless.
  useEffect(() => {
    if (isLoggedIn) {
      mergeGuestCart(getVisitorId());
    }
  }, [isLoggedIn]);

  // Clears the cart whenever the LOGGED-IN identity actually changes: a
  // real logout (some user -> guest), or — just as importantly — User A
  // logging in as User B without an explicit logout first (their token/
  // user object in localStorage is simply overwritten; isLoggedIn stays
  // true the whole time, so a plain true/false check never catches this
  // case, only a real true -> false transition). A shared/kiosk device
  // would otherwise keep User A's cart items, quantities and prices
  // sitting there for User B to unknowingly check out with. Tracking the
  // actual user id (not just the boolean) is what closes both cases.
  // wasUserId starts at the current id so a guest's own cart survives the
  // very first render, and guest -> first login is deliberately left
  // alone — that carry-over is the expected "add to cart, then sign in"
  // flow, not a leak.
  const wasUserId = useRef(user?._id ?? null);

  useEffect(() => {
    const currentUserId = user?._id ?? null;

    if (wasUserId.current && currentUserId !== wasUserId.current) {
      setCartItems([]);
    }

    wasUserId.current = currentUserId;
  }, [user]);

  // Mirror the cart to the backend (debounced) — logged-in customers sync
  // by account (also used for the abandoned-cart reminder), guests sync
  // by the same anonymous visitorId page-view tracking uses, so
  // product-wise cart counts aren't blind to whichever one applies.
  // Purely a background sync, not used to render anything here.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoggedIn) {
        syncCart(cartItems);
      } else {
        syncGuestCart(getVisitorId(), cartItems);
      }
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
        toast.error(t(`Only ${stock} in stock`, `केवल ${stock} स्टॉक में`));
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

      toast.info(t("Product quantity updated", "प्रोडक्ट मात्रा अपडेट हुई"));
    } else {
      if (stock <= 0) {
        toast.error(t("Out of stock", "स्टॉक में नहीं है"));
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

      toast.success(t("Product added to cart 🛒", "प्रोडक्ट कार्ट में जोड़ा गया 🛒"));
    }

    openCart();
  };

  const removeFromCart = (id) => {
    setCartItems(cartItems.filter((item) => item._id !== id));

    toast.error(t("Product removed from cart", "प्रोडक्ट कार्ट से हटाया गया"));
  };

  const increaseQty = (id) => {
    const item = cartItems.find((cartItem) => cartItem._id === id);

    if (item && item.quantity >= item.stock) {
      toast.error(t(`Only ${item.stock} in stock`, `केवल ${item.stock} स्टॉक में`));
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
    toast.warning(t("Cart cleared", "कार्ट खाली किया गया"));
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const totalPrice = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const presentCategoryIds = new Set(
    cartItems.map((item) => item.category?._id).filter(Boolean),
  );

  // Discount applies only to items from a matched rule's two categories,
  // not the whole cart — an unrelated item (e.g. a towel) riding along
  // must not get discounted just because a bundle unlocked. When more
  // than one rule matches at once, only one is ever applied — never
  // stacked — but it's whichever pair yields the highest actual rupee
  // discount, not just the highest percent (mirrors the server-side
  // calculation in bundleDiscount.js, which is what checkout charges).
  const eligibleItemsFor = (rule) => {
    const ruleCategoryIds = new Set([rule.categoryA?._id, rule.categoryB?._id]);
    return cartItems.filter((item) => ruleCategoryIds.has(item.category?._id));
  };

  const bestCandidate = bundleRules
    .filter(
      (rule) =>
        presentCategoryIds.has(rule.categoryA?._id) &&
        presentCategoryIds.has(rule.categoryB?._id),
    )
    .map((rule) => {
      const eligibleItems = eligibleItemsFor(rule);
      const eligibleSubtotal = eligibleItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      return {
        rule,
        eligibleItems,
        eligibleSubtotal,
        discountAmount: Math.round(
          (eligibleSubtotal * rule.discountPercent) / 100,
        ),
      };
    })
    .sort((a, b) => b.discountAmount - a.discountAmount)[0];

  // No full match yet — find a rule that's one category away, to nudge
  // the customer toward completing it (prefer the highest-value nudge).
  const nudgeRule = bestCandidate
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

  const bundleInfo = {
    eligible: Boolean(bestCandidate),
    discountPercent:
      bestCandidate?.rule.discountPercent || nudgeRule?.discountPercent || 0,
    discountAmount: bestCandidate?.discountAmount || 0,
    eligibleItems: bestCandidate?.eligibleItems || [],
    eligibleSubtotal: bestCandidate?.eligibleSubtotal || 0,
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
