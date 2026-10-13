import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { toast } from "react-toastify";

import { syncCart, syncGuestCart, mergeGuestCart } from "../services/cartService";
import { getSiteSettings } from "../services/settingsService";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";
import { getVisitorId } from "../utils/visitorId";
import { readJsonFromStorage } from "../utils/safeLocalStorage";
import { trackAddToCart, trackRemoveFromCart } from "../utils/analytics";

// Split into two contexts (CWV audit, 2026-10-12): ProductCard/
// QuickViewModal/AutoCompareTable/etc. only ever call addToCart -- they
// never read cart CONTENTS (no "already in cart" indicator exists
// anywhere on a product card). Before this split, every one of them
// still re-rendered on every Add to Cart click anyway, because they all
// read the SAME context object that also carries cartItems/totalItems/
// etc. -- React's useContext re-renders every subscriber on ANY change
// to the value a Provider passes, regardless of which fields a
// particular consumer destructures out of it afterward. Splitting the
// rarely-changing actions (stable forever, see the ref pattern below)
// from the data that changes on every cart mutation is what actually
// stops that waste -- plain useMemo/useCallback on a single shared
// context value could NOT have fixed this, since totalItems/totalPrice
// legitimately change on every addToCart call and anything bundled into
// the same object would still force a new reference each time.
const CartActionsContext = createContext();
const CartDataContext = createContext();

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

  // Always mirrors the latest cartItems, read-only, updated after every
  // render where it changed -- lets the action callbacks below (wrapped
  // in useCallback with empty/near-empty deps, so they're referentially
  // STABLE forever) read the current cart for their business-logic
  // decisions (existing-item lookup, stock caps, what toast/analytics
  // event to fire) without needing cartItems in their own dependency
  // array, which would re-create them on every cart change and defeat
  // the whole point of splitting CartActionsContext out above.
  const cartItemsRef = useRef(cartItems);
  useEffect(() => {
    cartItemsRef.current = cartItems;
  }, [cartItems]);

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

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  // variant, when given, is one entry from product.variants (a size with
  // its own price/stock) — see ProductDetails.jsx's size selector. Each
  // size becomes its own cart line (distinct _id) since price/stock
  // differ per size, but the real product ObjectId is kept as productId
  // so checkout still submits a valid order item.
  //
  // Reads cartItemsRef.current (not the cartItems state var) so this
  // callback's own identity never changes -- see the ref's comment above
  // for why that matters. [t, openCart] are its only real deps; both are
  // themselves stable except for a rare language-toggle re-create of `t`.
  const addToCart = useCallback(
    (product, qty = 1, variant = null) => {
      const cartItems = cartItemsRef.current;
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

        // Functional updater, not the `cartItems`/`existingItem` read
        // above — two rapid Add to Cart clicks (or a double-tap) can both
        // fire before cartItemsRef has caught up from the first one's
        // state update (the ref only refreshes in a useEffect, which runs
        // after commit, not synchronously). Reading the ref for the
        // decision above is fine (worst case a slightly stale stock-cap
        // toast), but the actual mutation below must always build on
        // React's real latest state, or the second click's update
        // silently overwrites the first's instead of stacking (found in
        // the 2026-10-13 deep bug sweep).
        setCartItems((prev) =>
          prev.map((item) =>
            item._id === lineId
              ? { ...item, quantity: Math.min(item.quantity + qty, stock) }
              : item,
          ),
        );

        // Actual units added may be less than the requested qty if stock
        // capped it — track what really got added, not what was asked for.
        trackAddToCart(existingItem, newQuantity - existingItem.quantity);
        toast.info(t("Product quantity updated", "प्रोडक्ट मात्रा अपडेट हुई"));
      } else {
        if (stock <= 0) {
          toast.error(t("Out of stock", "स्टॉक में नहीं है"));
          return;
        }

        const newItem = {
          ...product,
          _id: lineId,
          productId: product._id,
          price,
          oldPrice,
          stock,
          selectedSize: variant?.size || "",
          quantity: Math.min(qty, stock),
        };

        setCartItems((prev) => {
          // The stale `existingItem` check above could have missed a
          // line item that a second rapid call for the SAME product just
          // added — merge into it here instead of pushing a duplicate.
          const alreadyAdded = prev.find((item) => item._id === lineId);
          return alreadyAdded
            ? prev.map((item) =>
                item._id === lineId
                  ? { ...item, quantity: Math.min(item.quantity + newItem.quantity, stock) }
                  : item,
              )
            : [...prev, newItem];
        });

        trackAddToCart(newItem, newItem.quantity);
        toast.success(t("Product added to cart 🛒", "प्रोडक्ट कार्ट में जोड़ा गया 🛒"));
      }

      openCart();
    },
    [t, openCart],
  );

  const removeFromCart = useCallback(
    (id) => {
      const item = cartItemsRef.current.find((cartItem) => cartItem._id === id);

      setCartItems((prev) => prev.filter((cartItem) => cartItem._id !== id));

      if (item) trackRemoveFromCart(item);
      toast.error(t("Product removed from cart", "प्रोडक्ट कार्ट से हटाया गया"));
    },
    [t],
  );

  const increaseQty = useCallback(
    (id) => {
      const item = cartItemsRef.current.find((cartItem) => cartItem._id === id);

      if (item && item.quantity >= item.stock) {
        toast.error(t(`Only ${item.stock} in stock`, `केवल ${item.stock} स्टॉक में`));
        return;
      }

      // Functional updater (not a plain array built from the ref read
      // above) — see addToCart's comment on the same race. The `< stock`
      // guard is repeated here against the functional updater's own
      // fresh `cartItem`, not just the pre-check above, so the stock cap
      // holds even if two rapid clicks both passed the pre-check against
      // a stale ref.
      setCartItems((prev) =>
        prev.map((cartItem) =>
          cartItem._id === id && cartItem.quantity < cartItem.stock
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem,
        ),
      );

      if (item) trackAddToCart(item, 1);
    },
    [t],
  );

  const decreaseQty = useCallback(
    (id) => {
      const item = cartItemsRef.current.find((cartItem) => cartItem._id === id);

      // Silently did nothing at quantity 1 before -- no toast, no disabled
      // state, unlike increaseQty above which already toasts when capped
      // by stock. A customer clicking "-" at 1 had no way to tell the
      // click even registered; "Remove" is the only way to actually drop
      // an item, and this makes that explicit instead of leaving them to
      // guess why nothing happened.
      if (item && item.quantity <= 1) {
        toast.info(
          t(
            "Already at the minimum — use Remove to take this out of your cart",
            "पहले से न्यूनतम पर है — कार्ट से हटाने के लिए Remove इस्तेमाल करें",
          ),
        );
        return;
      }

      // Same functional-updater fix as increaseQty, floor re-checked
      // against fresh state so two rapid "-" clicks can't drop below 1.
      setCartItems((prev) =>
        prev.map((cartItem) =>
          cartItem._id === id && cartItem.quantity > 1
            ? { ...cartItem, quantity: cartItem.quantity - 1 }
            : cartItem,
        ),
      );

      // Only a real decrement (already-at-1 is a no-op above) counts as
      // actually removing a unit from the cart.
      if (item && item.quantity > 1) trackRemoveFromCart({ ...item, quantity: 1 });
    },
    [t],
  );

  const clearCart = useCallback(() => {
    setCartItems([]);
    toast.warning(t("Cart cleared", "कार्ट खाली किया गया"));
  }, [t]);

  // Patches a single line item's price/oldPrice/stock (and caps its
  // quantity to the new stock) — used by Cart.jsx to refresh stale
  // snapshots against live product data on load. addToCart only ever
  // copies price/stock in at add-time; nothing else revisits it for as
  // long as the item sits in the cart, so a price change or a stock drop
  // after adding was otherwise invisible until checkout rejected it with
  // a confusing error.
  // Already used the functional-updater form, so it never needed
  // cartItems in its own closure at all -- just needs wrapping to get a
  // stable identity for the actions context below.
  const reconcileCartItem = useCallback((id, updates) => {
    setCartItems((prev) =>
      prev.map((item) => (item._id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  // totalItems/totalPrice/bundleInfo all legitimately change whenever
  // cartItems or bundleRules change -- useMemo here isn't about making
  // them stable (they can't be, their whole job is to reflect the cart),
  // it's about not re-deriving this bundle-matching logic (several
  // .filter/.map/.sort passes) on every render of CartProvider for
  // reasons unrelated to either dependency.
  const { totalItems, totalPrice, bundleInfo } = useMemo(() => {
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

    return { totalItems, totalPrice, bundleInfo };
  }, [cartItems, bundleRules]);

  // Actions never change reference (every one above is a stable
  // useCallback) -- ProductCard/QuickViewModal/etc. subscribe to ONLY
  // this context via useCartActions() specifically so a cart content
  // change (addToCart, qty update, ...) never re-renders them. Cart.jsx/
  // CartDrawer.jsx/Header.jsx/Checkout.jsx/BottomNav.jsx need the data
  // too, so they use the combined useCart() below instead.
  const actionsValue = useMemo(
    () => ({
      addToCart,
      removeFromCart,
      increaseQty,
      decreaseQty,
      clearCart,
      reconcileCartItem,
      openCart,
      closeCart,
    }),
    [
      addToCart,
      removeFromCart,
      increaseQty,
      decreaseQty,
      clearCart,
      reconcileCartItem,
      openCart,
      closeCart,
    ],
  );

  const dataValue = useMemo(
    () => ({ cartItems, totalItems, totalPrice, bundleInfo, isCartOpen }),
    [cartItems, totalItems, totalPrice, bundleInfo, isCartOpen],
  );

  return (
    <CartActionsContext.Provider value={actionsValue}>
      <CartDataContext.Provider value={dataValue}>
        {children}
      </CartDataContext.Provider>
    </CartActionsContext.Provider>
  );
}

// Combined hook (data + actions) for consumers that need cart CONTENTS,
// not just the ability to mutate it -- Cart.jsx, CartDrawer.jsx,
// Header.jsx, Checkout.jsx, BottomNav.jsx. Re-renders on every cart
// change, same as before this split; that's correct for these, they
// exist specifically to show cart state.
export function useCart() {
  const actions = useContext(CartActionsContext);
  const data = useContext(CartDataContext);
  return { ...actions, ...data };
}

// Actions-only hook for consumers that only ever call addToCart and
// never display cart contents (ProductCard, QuickViewModal,
// AutoCompareTable, Compare.jsx, Wishlist.jsx, MyOrders.jsx,
// ProductDetails.jsx) -- subscribing to CartActionsContext alone means
// these never re-render just because someone added an item to the cart.
export function useCartActions() {
  return useContext(CartActionsContext);
}
