// GA4 e-commerce event tracking — fires through the gtag() stub already
// set up in index.html. That stub only exists for real traffic (see its
// own comment: skipped on localhost and /admin so dev sessions and the
// site owner's own admin usage don't pollute production analytics), so
// checking `typeof window.gtag === "function"` here is what makes every
// call in this file a no-op in those cases too, without duplicating that
// exclusion logic.
//
// Before this file, GA4 only ever saw automatic page_view hits — there
// was no way to see the actual purchase funnel (view -> cart -> checkout
// -> purchase) or attribute revenue to a session/channel at all. Follows
// GA4's own recommended e-commerce event schema so Google's standard
// e-commerce reports (not just custom exploration) pick these up.
const trackEvent = (eventName, params = {}) => {
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }
};

// A cart line item's shape (CartContext.jsx) and a raw Product doc
// (ProductDetails.jsx) differ slightly (price vs product.price, no
// `category` populated the same way everywhere) -- this normalizes
// either into a GA4 item object rather than duplicating that mapping at
// every call site.
const toGa4Item = (item, quantity) => ({
  item_id: item.productId || item._id,
  item_name: item.name,
  item_category: item.category?.name || undefined,
  item_variant: item.selectedSize || item.size || undefined,
  price: item.price,
  quantity,
});

export const trackViewItem = (product) => {
  trackEvent("view_item", {
    currency: "INR",
    value: product.price,
    items: [
      {
        item_id: product._id,
        item_name: product.name,
        item_category: product.category?.name || undefined,
        price: product.price,
      },
    ],
  });
};

export const trackAddToCart = (item, quantity) => {
  trackEvent("add_to_cart", {
    currency: "INR",
    value: item.price * quantity,
    items: [toGa4Item(item, quantity)],
  });
};

export const trackRemoveFromCart = (item) => {
  trackEvent("remove_from_cart", {
    currency: "INR",
    value: item.price * item.quantity,
    items: [toGa4Item(item, item.quantity)],
  });
};

export const trackBeginCheckout = (cartItems, value) => {
  trackEvent("begin_checkout", {
    currency: "INR",
    value,
    items: cartItems.map((item) => toGa4Item(item, item.quantity)),
  });
};

export const trackPurchase = (order, cartItems) => {
  trackEvent("purchase", {
    // Server-generated ObjectId, unique per order -- GA4 uses this to
    // de-duplicate a purchase event that somehow fires twice for the
    // same transaction.
    transaction_id: order._id,
    currency: "INR",
    value: order.totalPrice,
    shipping: order.deliveryFee || 0,
    items: cartItems.map((item) => toGa4Item(item, item.quantity)),
  });
};
