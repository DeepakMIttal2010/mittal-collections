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

// Meta Pixel's standard e-commerce events — fired alongside the matching
// GA4 call at the same four funnel steps (view/cart/checkout/purchase) so
// a future retargeting/conversion campaign has a real "viewed but didn't
// buy" audience to build from. Same `typeof window.fbq === "function"`
// no-op guard as trackEvent above, for the same reason: index.html's fbq
// stub is skipped on localhost/admin, so this is a no-op there too.
const trackMetaEvent = (eventName, params = {}) => {
  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, params);
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
  trackMetaEvent("ViewContent", {
    content_ids: [product._id],
    content_type: "product",
    content_name: product.name,
    currency: "INR",
    value: product.price,
  });
};

export const trackAddToCart = (item, quantity) => {
  trackEvent("add_to_cart", {
    currency: "INR",
    value: item.price * quantity,
    items: [toGa4Item(item, quantity)],
  });
  trackMetaEvent("AddToCart", {
    content_ids: [item.productId || item._id],
    content_type: "product",
    content_name: item.name,
    currency: "INR",
    value: item.price * quantity,
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
  trackMetaEvent("InitiateCheckout", {
    content_ids: cartItems.map((item) => item.productId || item._id),
    content_type: "product",
    currency: "INR",
    value,
    num_items: cartItems.reduce((sum, item) => sum + item.quantity, 0),
  });
};

// Built from `order.orderItems` (the server-confirmed line items), not a
// `cartItems` param, so every path that ends in a real payment can call
// this the same way regardless of what's in the live cart at that
// moment — in particular the "Pay Now" resume flow (razorpay.js), which
// re-verifies a payment for an order placed in an earlier session and has
// no live cart to read from at all. Before this, that path verified the
// payment successfully but never fired `purchase`, silently undercounting
// real revenue in GA4.
export const trackPurchase = (order) => {
  trackEvent("purchase", {
    // Server-generated ObjectId, unique per order -- GA4 uses this to
    // de-duplicate a purchase event that somehow fires twice for the
    // same transaction.
    transaction_id: order._id,
    currency: "INR",
    value: order.totalPrice,
    shipping: order.deliveryFee || 0,
    items: (order.orderItems || []).map((item) => ({
      item_id: item.product?._id || item.product,
      item_name: item.name,
      item_variant: item.size || undefined,
      price: item.price,
      quantity: item.quantity,
    })),
  });
  trackMetaEvent("Purchase", {
    content_ids: (order.orderItems || []).map((item) => item.product?._id || item.product),
    content_type: "product",
    currency: "INR",
    value: order.totalPrice,
    num_items: (order.orderItems || []).reduce((sum, item) => sum + item.quantity, 0),
  });
};

// Fired when a search is actually submitted (typed Enter/Go, or a voice
// search result) — not on every keystroke, which would flood GA4 with
// partial queries instead of one event per real search intent.
export const trackSearch = (searchTerm) => {
  trackEvent("search", { search_term: searchTerm });
};

// Homepage hero banners -- GA4's recommended promotion events. `params`
// comes from utils/heroPromotion.js: promotion_id, promotion_name,
// creative_slot and device (a custom parameter; register it as a custom
// dimension in GA4 to report on it). GA4 fills its built-in promotion
// dimensions (Item promotion ID/name/creative slot) from `items`, which
// these events require, so the banner also goes in as the one item.
const promotionPayload = (params) => ({
  ...params,
  items: [
    {
      item_id: params.promotion_id,
      item_name: params.promotion_name,
      promotion_id: params.promotion_id,
      promotion_name: params.promotion_name,
      creative_slot: params.creative_slot,
    },
  ],
});

export const trackViewPromotion = (params) => trackEvent("view_promotion", promotionPayload(params));

export const trackSelectPromotion = (params) => trackEvent("select_promotion", promotionPayload(params));

// Fired when a customer picks a specific product out of a list — a
// product grid, the header's search-suggestions dropdown, etc. `listName`
// identifies which surface the click came from, since the same product
// can be reached from several different listings.
//
// `listId` (optional) names the homepage section a product card sits in
// (home_new_arrivals, home_recently_viewed, home_clearance). It goes in
// GA4's item_list_id so item_list_name -- and every existing report built
// on it -- stays exactly as before; calls without it send no
// item_list_id key at all.
export const trackSelectItem = (product, listName = "product_list", listId) => {
  trackEvent("select_item", {
    item_list_name: listName,
    ...(listId ? { item_list_id: listId } : {}),
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

// Homepage sections that send select_content when one of their links
// (a category, size, price range or "view all" link -- not a product
// card, which uses trackSelectItem's listId) is clicked. Reported in GA4
// through the event-scoped custom dimension `home_section`.
export const HOME_SECTIONS = Object.freeze([
  "home_category_grid",
  "home_quick_links",
  "home_size_showcase",
  "home_shop_by_price",
  "home_new_arrivals",
  "home_clearance",
]);

// Only a category/subcategory slug, a price number or a short fixed word
// ("view_all") -- never free text that could carry personal data.
const SAFE_TARGET = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export const trackHomeSectionClick = (section, target) => {
  const id = typeof target === "number" ? String(target) : target;
  if (!HOME_SECTIONS.includes(section) || typeof id !== "string" || !SAFE_TARGET.test(id)) return;
  trackEvent("select_content", { content_type: "home_section", home_section: section, item_id: id });
};

// home_scroll_25 / _50 / _75 / _90: how far down the homepage a visitor got
// (see utils/homeScrollDepth.js). The depth is in the event name so GA4
// reports it without registering a custom dimension.
export const trackHomeScroll = (depth) => {
  if (![25, 50, 75, 90].includes(depth)) return;
  trackEvent(`home_scroll_${depth}`, {});
};

// Fired once a payment method is actually selected on the checkout page
// (not a GA4-standard-named event otherwise, but "add_payment_info" is
// the real recommended GA4 e-commerce event name for this step).
export const trackAddPaymentInfo = (paymentMethod, value) => {
  trackEvent("add_payment_info", {
    currency: "INR",
    value,
    payment_type: paymentMethod,
  });
};

// Fired when a category/subcategory facet filter is actually applied
// (the mobile bottom-sheet's "Apply" button, or the desktop sidebar's
// instant-apply toggle) — not on every intermediate draft checkbox click,
// same "real intent, not every keystroke" reasoning as trackSearch above.
export const trackFilter = (filterName, filterValue) => {
  trackEvent("filter", { filter_name: filterName, filter_value: filterValue });
};
