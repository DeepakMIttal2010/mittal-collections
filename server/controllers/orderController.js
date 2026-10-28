import Razorpay from "razorpay";
import crypto from "crypto";
import Order from "../models/Order.js";
import Coupon from "../models/Coupon.js";
import SiteSettings from "../models/SiteSettings.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import CartSnapshot from "../models/CartSnapshot.js";
import ReturnRequest from "../models/ReturnRequest.js";
import Ticket from "../models/Ticket.js";
import { notifyStockAlertSubscribers } from "./productController.js";
import { resolveFastDelivery } from "./deliveryController.js";
import {
  calculateDiscount,
  isEligibleForFirstOrderCoupon,
} from "./couponController.js";
import {
  getLoyaltySettings,
  pointsEarnedFor,
  maxRedeemablePoints,
  applyLoyaltyPointsChange,
  getSpendablePoints,
  eligibleEarnBase,
  pointsAvailableAtFor,
  refundRedeemedPoints,
  reverseOrderEarn,
  reverseReferralBonus,
} from "../utils/loyaltyPoints.js";
import { calculateDeliveryFee } from "../utils/shipping.js";
import { calculateBundleDiscount } from "../utils/bundleDiscount.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "../utils/notify.js";
import { hasAdminPermission } from "../utils/adminAccess.js";
import { REVIEW_BONUS_POINTS } from "./reviewController.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import OrderCost from "../models/OrderCost.js";
import { syncOrder, postSafely } from "../utils/accountingPosting.js";
import { getPendingPaymentConfig } from "../config/pendingPayment.js";
import {
  transactionsSupported,
  withOptionalTransaction,
  TransactionsUnavailableError,
} from "../utils/orderTransactions.js";
import {
  markOrderPaid,
  flagPaymentReview,
  sendPaymentReviewAlert,
  sendPaymentNotice,
  notifyPaymentConfirmed,
  NOTICE_LEASE_MS,
} from "../utils/orderPayment.js";

// Lazily constructed so a missing/blank key in dev doesn't crash the
// whole server at import time — only Razorpay-paid checkouts need it.
let razorpayInstance = null;
const getRazorpay = () => {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
};

// Shared by createOrder's clientRequestId fast-path (a retry that
// arrives after the original request already finished) and its
// duplicate-key race handler (two truly concurrent submissions both
// reaching Order.create() — see the unique index on
// {user, clientRequestId} in Order.js) — both hand back the order that
// actually won, shaped the same way a fresh 201 response is.
const buildOrderResponse = (order) => ({
  success: true,
  order,
  razorpayOrder:
    order.paymentMethod === "Razorpay" && order.razorpayOrderId
      ? {
          id: order.razorpayOrderId,
          amount: Math.round(order.totalPrice * 100),
          currency: "INR",
        }
      : null,
  razorpayKeyId: order.paymentMethod === "Razorpay" ? process.env.RAZORPAY_KEY_ID : null,
});

// Computes per-item return eligibility (whether the product allows
// returns at all, and whether "deliveredAt + return period" hasn't
// passed yet) and attaches it as `returnInfo` on each order item, so
// the client never has to duplicate this date math.
const attachReturnEligibility = async (orders) => {
  const settings = await SiteSettings.findOne();
  const defaultDays = settings?.defaultReturnPeriodDays ?? 7;

  const wasArray = Array.isArray(orders);
  const list = wasArray ? orders : [orders];

  const decorated = list.map((order) => {
    const obj = order.toObject ? order.toObject() : order;

    obj.orderItems = (obj.orderItems || []).map((item) => {
      const product = item.product;
      const isPopulated = product && typeof product === "object";

      const isReturnableProduct = isPopulated
        ? product.isReturnable !== false
        : true;
      const periodDays =
        (isPopulated && product.returnPeriodDays) || defaultDays;

      let deadline = null;
      let eligible = false;

      if (obj.orderStatus === "Delivered" && obj.deliveredAt && isReturnableProduct) {
        deadline = new Date(obj.deliveredAt);
        deadline.setDate(deadline.getDate() + periodDays);
        eligible = new Date() <= deadline;
      }

      return {
        ...item,
        product: isPopulated ? product._id : product,
        returnInfo: { isReturnable: isReturnableProduct, periodDays, deadline, eligible },
      };
    });

    return obj;
  });

  return wasArray ? decorated : decorated[0];
};

// Hi copy is only used for the email (subjectHi/bodyHi below) -- the
// in-app notification (notifyUser call in sendOrderStatusNotification)
// stays English-only, same scope as the rest of this round's
// localization pass (customer-facing emails first).
const ORDER_STATUS_MESSAGES = {
  Processing: {
    subject: "Your order is being processed",
    subjectHi: "आपका ऑर्डर प्रोसेस हो रहा है",
    body: "Your order is now being processed and will be shipped soon.",
    bodyHi: "आपका ऑर्डर अभी प्रोसेस हो रहा है और जल्द ही भेजा जाएगा।",
  },
  Shipped: {
    subject: "Your order has shipped",
    subjectHi: "आपका ऑर्डर भेज दिया गया है",
    body: "Your order is on its way!",
    bodyHi: "आपका ऑर्डर रास्ते में है!",
  },
  Delivered: {
    subject: "Your order has been delivered",
    subjectHi: "आपका ऑर्डर डिलीवर हो गया है",
    body: "Your order has been delivered. We hope you love it!",
    bodyHi: "आपका ऑर्डर डिलीवर हो गया है। हमें उम्मीद है आपको पसंद आएगा!",
  },
  Cancelled: {
    subject: "Your order has been cancelled",
    subjectHi: "आपका ऑर्डर रद्द कर दिया गया है",
    body: "Your order has been cancelled. If a coupon or loyalty points were used, they've been refunded to your account.",
    bodyHi: "आपका ऑर्डर रद्द कर दिया गया है। अगर कोई कूपन या लॉयल्टी पॉइंट्स इस्तेमाल किए गए थे, तो वे आपके अकाउंट में वापस कर दिए गए हैं।",
  },
};

// Shared by every path that needs to tell a customer their order's status
// changed (or re-tell them, for the same status) — the in-app notification
// bell plus an email, both keyed off ORDER_STATUS_MESSAGES. Fire-and-forget:
// callers don't await this, matching the existing behavior at each call site.
const sendOrderStatusNotification = (order, status) => {
  const statusMessage = ORDER_STATUS_MESSAGES[status];

  if (!statusMessage) return;

  notifyUser({
    userId: order.user,
    type: "order_status",
    title: statusMessage.subject,
    message: `Order ID: ${order._id}`,
    link: `/my-orders/${order._id}`,
  });

  User.findById(order.user)
    .select("name email preferredLanguage")
    .then((customer) => {
      if (!customer?.email) return;

      const isHindi = customer.preferredLanguage === "hi";

      return sendEmail({
        to: customer.email,
        bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: isHindi ? statusMessage.subjectHi : statusMessage.subject,
        html: isHindi
          ? `
          <p>नमस्ते ${escapeHtml(customer.name || "")},</p>
          <p>${statusMessage.bodyHi}</p>
          <p>ऑर्डर आईडी: ${order._id}</p>
          <p><a href="${process.env.CLIENT_URL}/my-orders/${order._id}">अपना ऑर्डर देखें</a></p>
        `
          : `
          <p>Hi ${escapeHtml(customer.name || "there")},</p>
          <p>${statusMessage.body}</p>
          <p>Order ID: ${order._id}</p>
          <p><a href="${process.env.CLIENT_URL}/my-orders/${order._id}">View your order</a></p>
        `,
      });
    })
    .catch((error) => console.error("Order Status Email Error:", error));
};

// Matches (and slightly exceeds) SiteSettings.defaultReturnPeriodDays —
// by this point the return window has closed, so an order that reaches
// this point without a return means the customer kept the product and
// is a genuine "they liked it" signal, not just a guess at 4 days.
const REVIEW_REQUEST_DELAY_DAYS = 8;

// Re-derives price/name/image from the database and validates quantity —
// req.body.orderItems is never trusted for anything that affects money or
// inventory. Without this, a client could submit an arbitrary price (get
// any product for ₹1) or a negative quantity (reserveStock's `$inc:
// {stock: -item.quantity}` would then *increase* stock while totalPrice
// gets clamped to 0 by the Math.max below — a free order that also
// inflates inventory). `product` and `size` (which item/variant they
// want) still come from the client; everything else that matters is
// re-derived here.
const verifyOrderItems = async (rawItems) => {
  const productIds = rawItems.map((item) => item.product);
  // Soft-deleted (isActive: false) and in-store-only (visibility:
  // "offline") products were still fetchable here even though every
  // *listing* endpoint already excludes them — a bookmarked/shared
  // product-detail URL, or a crafted request straight to this API,
  // could place a real order for a product the admin thought they'd
  // pulled from sale. Excluding them here routes to the same "no
  // longer available" response the code already gives for a genuinely
  // missing product, below.
  const products = await Product.find({
    _id: { $in: productIds },
    isActive: true,
    visibility: { $ne: "offline" },
  });
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  const verified = [];

  for (const item of rawItems) {
    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        success: false,
        message: `Invalid quantity for "${item.name || "an item"}".`,
      };
    }

    const product = productById.get(String(item.product));

    if (!product) {
      return {
        success: false,
        message: `"${item.name || "An item"}" is no longer available.`,
      };
    }

    let price;
    let stock;

    if (item.size) {
      const variant = product.variants.find((v) => v.size === item.size);

      if (!variant) {
        return {
          success: false,
          message: `"${product.name}" is no longer available in size "${item.size}".`,
        };
      }

      price = variant.price;
      stock = variant.stock;
    } else if (product.variants?.length > 0) {
      // A sized product's top-level price/stock only mirror the first
      // size / the sum of all sizes. Accepting it without a size charged
      // the first size's price, reserved stock from the summed total
      // only (silently undone on the next product save, which re-sums
      // the variants) and left the order with no size to ship. Every
      // storefront add-to-cart already sends a size for these.
      return {
        success: false,
        message: `Please choose a size for "${product.name}".`,
      };
    } else {
      price = product.price;
      stock = product.stock;
    }

    if (stock < quantity) {
      return {
        success: false,
        message: `Sorry, "${product.name}" doesn't have enough stock available.`,
      };
    }

    verified.push({
      product: product._id,
      name: product.name,
      image: product.image,
      price,
      quantity,
      size: item.size || "",
      localDeliveryOnly: product.localDeliveryOnly,
      // Not part of Order.orderItems' schema (Mongoose strict mode drops
      // them from the Order document); read only by the OrderCost
      // snapshot taken right after Order.create() in createOrder.
      unitPurchasePrice: item.size
        ? product.variants.find((v) => v.size === item.size)?.purchasePrice || 0
        : product.purchasePrice || 0,
      unitMiscExpenses: product.miscExpenses || 0,
    });
  }

  return { success: true, items: verified };
};

// Atomically reserve stock for every item. If any item doesn't have enough
// stock, roll back the items already reserved and return that item's name.
// For a variant item (item.size set), both the specific variant's stock
// AND the top-level stock (kept as a sum-of-variants rollup, see
// Product.js) are decremented in the same update, matched via
// arrayFilters so a same-named size on another product can't collide.
//
// `session` (optional) runs every write inside the caller's transaction.
const reserveStock = async (orderItems, { session = null } = {}) => {
  const reserved = [];

  for (const item of orderItems) {
    const updated = item.size
      ? await Product.findOneAndUpdate(
          {
            _id: item.product,
            stock: { $gte: item.quantity },
            variants: {
              $elemMatch: { size: item.size, stock: { $gte: item.quantity } },
            },
          },
          { $inc: { stock: -item.quantity, "variants.$[v].stock": -item.quantity } },
          { new: true, arrayFilters: [{ "v.size": item.size }], session },
        )
      : await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true, session },
        );

    if (!updated) {
      // One batched call instead of one restoreStock() invocation per
      // already-reserved item -- restoreStock already loops internally,
      // so the per-item wrapping here only added N extra round trips on
      // a path that can already have several items reserved before a
      // later one runs out of stock (N+1 audit, 2026-10-13).
      await restoreStock(reserved, { session });

      return { success: false, failedItemName: item.name };
    }

    reserved.push({
      product: item.product,
      quantity: item.quantity,
      size: item.size,
    });
  }

  return { success: true };
};

// Each order item is an independent atomic $inc on its own product doc
// (or its own variant sub-document) -- unlike reserveStock below, there's
// no early-exit-on-failure/rollback invariant linking one item to the
// next, so firing all the updates concurrently is safe and cuts an
// N-item order's restore from N sequential round trips to one wall-clock
// round trip (N+1 audit, 2026-10-13).
//
// Inside a transaction (`session` set) the updates run one after another —
// a session can't carry concurrent operations — and the back-in-stock
// emails are NOT sent: the products that came back are returned instead,
// for the caller to pass to notifyRestocked() once the transaction has
// actually committed (a rolled-back restock must not email anyone).
const restockOne = (item, session) =>
  item.size
    ? Product.findOneAndUpdate(
        { _id: item.product, "variants.size": item.size },
        { $inc: { stock: item.quantity, "variants.$[v].stock": item.quantity } },
        { new: true, arrayFilters: [{ "v.size": item.size }], session },
      )
    : Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity } },
        { new: true, session },
      );

const cameBackInStock = (product, item) =>
  product && product.stock - item.quantity <= 0 && product.stock > 0;

const notifyRestocked = (products) => {
  products.forEach((product) =>
    notifyStockAlertSubscribers(product).catch((error) =>
      console.error("Notify Stock Alert Subscribers Error:", error),
    ),
  );
};

export const restoreStock = async (orderItems, { session = null } = {}) => {
  if (session) {
    const restocked = [];

    for (const item of orderItems) {
      const product = await restockOne(item, session);
      if (cameBackInStock(product, item)) restocked.push(product);
    }

    return restocked;
  }

  await Promise.all(
    orderItems.map(async (item) => {
      const product = await restockOne(item, null);
      if (cameBackInStock(product, item)) notifyRestocked([product]);
    }),
  );

  return [];
};

// Everything a cancellation gives back, for any order: stock (minus what
// already came back through a return), redeemed points, points already
// earned from it, the one-time first-order coupon, and a referral bonus
// this order triggered. Shared by the admin Cancel action and the
// pending-payment cron, and meant to run inside the same transaction as
// the status claim — so the order is never Cancelled with its stock still
// out, or the other way round. Returns the products that came back in
// stock (see restoreStock).
const releaseOrderResources = async (
  order,
  { session = null, refundDescription = `Refund for cancelled order ${order._id}` } = {},
) => {
  // A delivered order can be cancelled after part of it came back
  // through a return -- that quantity is already back on the shelf
  // (returnController restocks it), so only the rest goes back now.
  const returned = await ReturnRequest.find({ order: order._id, stockRestored: true })
    .select("product size quantity")
    .session(session)
    .lean();
  const lineKey = (x) => `${x.product}|${x.size || ""}`;
  const backByLine = new Map();
  returned.forEach((r) => backByLine.set(lineKey(r), (backByLine.get(lineKey(r)) || 0) + r.quantity));
  const stillOut = order.orderItems
    .map((item) => {
      const back = Math.min(backByLine.get(lineKey(item)) || 0, item.quantity);
      backByLine.set(lineKey(item), (backByLine.get(lineKey(item)) || 0) - back);
      return { ...(item.toObject?.() ?? item), quantity: item.quantity - back };
    })
    .filter((item) => item.quantity > 0);

  const restocked = await restoreStock(stillOut, { session });

  // Give back any points spent on this order, into the batches they came
  // from...
  if (order.pointsRedeemed > 0) {
    await refundRedeemedPoints({ order, session, description: refundDescription });
  }

  // ...and take back points already credited from it (a delivered order
  // cancelled after its return window). Points still pending are simply
  // never credited — the credit job only credits Delivered orders.
  await reverseOrderEarn({ order, session });

  // ...and give back their one-time first-order-coupon eligibility
  // if this order is the one that claimed it (createOrder sets
  // firstOrderCouponApplied only once that atomic claim itself
  // succeeds) — an admin cancelling a customer's first order
  // (defective item, etc.) shouldn't permanently burn it.
  if (order.firstOrderCouponApplied) {
    await User.updateOne(
      { _id: order.user },
      { $set: { firstOrderCouponUsed: false } },
      { session },
    );
  }

  // ...and claw back the referral bonus if THIS order is the one
  // that triggered it (order.referralBonusPaid, set only once that
  // payout itself succeeds — see updateOrderStatus's Delivered branch).
  // Without this, cancelling or returning a referred customer's
  // first order kept both sides' referral points permanently, with
  // no signup/order left to justify them — repeatable by creating a
  // new account with someone else's referral code, placing a cheap
  // order, getting it marked Delivered, then cancelling/returning
  // it. Also releases referralRewarded so a genuinely-delivered
  // later order can still earn the bonus once, for real.
  await reverseReferralBonus({ order, session });

  return restocked;
};

// ============================
// Create New Order
// ============================

export const createOrder = async (req, res) => {
  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      couponCode,
      redeemPoints,
      clientRequestId,
    } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No order items",
      });
    }

    // Checkout.jsx always sends a crypto.randomUUID() string (36
    // chars) — anything else is either an old client that never sent
    // one, or a crafted value. `if (clientRequestId)` alone only checks
    // truthiness, and an object here (e.g. {"$gt": ""}) would otherwise
    // flow straight into the Mongo queries below as a query operator
    // instead of a literal value to match — the same NoSQL-injection
    // path CodeQL already flagged once in posController.js. Treating
    // anything non-string-or-oversized as "no id sent" is safe: it just
    // falls back to the createOrder path's normal (non-retry) behavior.
    const safeClientRequestId =
      typeof clientRequestId === "string" && clientRequestId.length <= 100
        ? clientRequestId
        : null;

    // A retry of a checkout that already succeeded (network auto-retry,
    // a double-tap on slow mobile data) — Checkout.jsx resends the same
    // clientRequestId unchanged on any retry, so if an order with it
    // already exists, this is that exact same checkout attempt landing
    // twice, not a new one. Handing back the original instead of
    // re-running verification/stock/points is both cheaper and what
    // stops a second, fully-valid order from being created.
    if (safeClientRequestId) {
      const existingOrder = await Order.findOne({
        user: req.user._id,
        clientRequestId: safeClientRequestId,
      });

      if (existingOrder) {
        return res.status(200).json(buildOrderResponse(existingOrder));
      }
    }

    const verifyResult = await verifyOrderItems(orderItems);

    if (!verifyResult.success) {
      return res.status(400).json({
        success: false,
        message: verifyResult.message,
      });
    }

    // From here on, only ever use verifiedItems — req.body's orderItems
    // may carry a tampered price/quantity and must not be used for
    // anything that affects money or inventory.
    const verifiedItems = verifyResult.items;

    // Bulky/oversized products (Product.localDeliveryOnly) can't ship
    // outside the nearby fast-delivery zone — the product page warns
    // about this, but that's a client-side hint only, so it's enforced
    // here too rather than trusting a customer never bypasses it via a
    // direct API call.
    if (verifiedItems.some((item) => item.localDeliveryOnly)) {
      const deliveryCheck = await resolveFastDelivery(shippingAddress?.pincode);

      if (!deliveryCheck.fastDelivery) {
        return res.status(400).json({
          success: false,
          message:
            "One or more items in your cart can't be delivered to this address. Please remove them or choose a different delivery address.",
        });
      }
    }

    const subtotal = verifiedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // 5 independent reads — none depends on another's result, so this
    // collapses what was up to 5 sequential round trips (every checkout,
    // the single hottest money-handling path in the app, on a Render
    // free-tier box talking to Atlas where each round trip has real
    // latency) into 1. The two conditional ones (coupon, currentUser)
    // resolve to null when their trigger isn't present, same as the old
    // code simply never running them.
    const [settingsDoc, bundleResult, loyaltySettings, coupon, spendablePoints] =
      await Promise.all([
        SiteSettings.findOne(),
        calculateBundleDiscount(verifiedItems),
        getLoyaltySettings(),
        couponCode
          ? Coupon.findOne({
              code: couponCode.trim().toUpperCase(),
              isActive: true,
            })
          : Promise.resolve(null),
        // Available, unexpired points only — pending points were never
        // in the balance, and a batch past its expiry doesn't count even
        // before the expiry job has processed it.
        redeemPoints && Number(redeemPoints) > 0
          ? getSpendablePoints(req.user._id)
          : Promise.resolve(0),
      ]);

    const settings = settingsDoc || {};
    const deliveryFee = calculateDeliveryFee(subtotal, settings);
    // Pass-through COD handling fee — never applied to Razorpay orders.
    const codCharge =
      paymentMethod === "COD" ? (settings.codCharge ?? 50) : 0;

    let discountAmount = 0;
    let appliedCouponCode = null;
    let appliedFirstOrderCoupon = false;

    if (coupon) {
      const eligible = coupon.firstOrderOnly
        ? await isEligibleForFirstOrderCoupon(req.user._id)
        : true;

      if (eligible) {
        discountAmount = calculateDiscount(coupon, subtotal);
        appliedCouponCode = coupon.code;
        appliedFirstOrderCoupon = coupon.firstOrderOnly;
      }
    }

    // Coupon, bundle, and points discounts used to each be capped
    // independently against the same original `subtotal` -- calculateDiscount
    // caps a coupon at the full subtotal, calculateBundleDiscount caps bundle
    // separately at its own eligible-category subtotal, and points were
    // capped at maxRedeemPercent of the ORIGINAL subtotal too. None of the
    // three was aware of the others, so legitimately combining all three
    // (no tampering needed) could discount well past 100% of the order's
    // real value -- e.g. a 30% coupon + a 40% bundle rule + a 50%-of-subtotal
    // points redemption on the same ~order could sum past the subtotal
    // entirely, and the final Math.max(...,0) floor silently absorbed the
    // rest as a free order (deep bug sweep, 2026-10-20). Clamping each
    // discount against what's actually still owed after the ones already
    // applied (rather than the pristine subtotal) means the three can never
    // collectively exceed the subtotal, without changing how any single
    // discount is itself calculated.
    let remainingAfterDiscounts = subtotal;

    discountAmount = Math.min(discountAmount, remainingAfterDiscounts);
    remainingAfterDiscounts -= discountAmount;

    const bundleDiscountAmount = Math.min(
      bundleResult.discountAmount,
      remainingAfterDiscounts,
    );
    remainingAfterDiscounts -= bundleDiscountAmount;

    // Loyalty points redemption — no minimum (from 1 point), capped to
    // what the user can actually spend and to maxRedeemPercent (10%) of
    // the merchandise left after the coupon/bundle discounts above, so it
    // can never take the order below zero. Delivery and COD charges are
    // never part of that base.
    let pointsRedeemed = 0;
    let pointsDiscount = 0;

    if (redeemPoints && Number(redeemPoints) > 0) {
      const requestedPoints = Math.floor(Number(redeemPoints));
      const allowed = maxRedeemablePoints(
        remainingAfterDiscounts,
        spendablePoints,
        loyaltySettings,
      );

      pointsRedeemed = Math.min(requestedPoints, allowed);
      pointsDiscount = pointsRedeemed * loyaltySettings.redeemValue;
    }

    const totalPrice = Math.max(
      subtotal +
        deliveryFee +
        codCharge -
        discountAmount -
        bundleDiscountAmount -
        pointsDiscount,
      0,
    );

    const stockResult = await reserveStock(verifiedItems);

    if (!stockResult.success) {
      return res.status(400).json({
        success: false,
        message: `Sorry, "${stockResult.failedItemName}" doesn't have enough stock available.`,
      });
    }

    let order;

    try {
      order = await Order.create({
        user: req.user._id,
        orderItems: verifiedItems,
        shippingAddress,
        paymentMethod,
        totalPrice,
        deliveryFee,
        codCharge,
        couponCode: appliedCouponCode,
        discountAmount,
        bundleDiscountAmount,
        bundleDiscountPercent: bundleResult.discountPercent || 0,
        bundleDiscountCategories: bundleResult.categoryNames || [],
        pointsRedeemed,
        pointsDiscount,
        clientRequestId: safeClientRequestId,
        statusHistory: [{ status: "Pending", changedAt: new Date() }],
      });
    } catch (orderError) {
      await restoreStock(verifiedItems);

      // Two truly concurrent submissions of the same checkout (the
      // fast-path lookup above only catches a retry that arrives after
      // the first one already finished) can both get past every other
      // check and both reach here — the unique index on
      // {user, clientRequestId} is what actually decides a winner. The
      // loser already reserved stock for nothing (restored above); hand
      // back whichever order won instead of a generic 500.
      if (orderError.code === 11000 && safeClientRequestId) {
        const winningOrder = await Order.findOne({
          user: req.user._id,
          clientRequestId: safeClientRequestId,
        });

        if (winningOrder) {
          return res.status(200).json(buildOrderResponse(winningOrder));
        }
      }

      throw orderError;
    }

    // Cost snapshot for profit reporting -- a separate admin-only
    // collection (see OrderCost.js for why it is not on the Order). A
    // failure here must never fail or roll back a real customer order;
    // a missing record is detectable later and can be backfilled.
    try {
      await OrderCost.create({
        order: order._id,
        items: verifiedItems.map((item) => ({
          product: item.product,
          size: item.size,
          quantity: item.quantity,
          unitPurchasePrice: item.unitPurchasePrice,
          unitMiscExpenses: item.unitMiscExpenses,
        })),
      });
    } catch (costError) {
      console.error("Order cost snapshot failed for order", order._id, costError);
    }

    // Tracks whether points were actually deducted below (not just
    // requested) — cancelAndReject uses this to know whether a refund
    // is owed, since it's also called from the points-race branch
    // itself, where nothing was ever deducted in the first place.
    let pointsActuallyDeducted = false;

    // Shared by every "this order was already created with a discount
    // baked into totalPrice, but the thing backing that discount lost
    // an atomic race after the fact" case below — cancels the order
    // through the same path a real cancellation uses: restoreStock,
    // a points refund if points were actually taken, and releasing
    // User.firstOrderCouponUsed if this order is the one that claimed
    // it (order.firstOrderCouponApplied, set only once that claim
    // itself succeeds below — never blindly, since resetting a flag
    // this order never actually claimed could hand the coupon back to
    // whichever other order legitimately holds it).
    const cancelAndReject = async (message, statusCode = 400, reason = "other") => {
      order.orderStatus = "Cancelled";
      order.statusHistory.push({ status: "Cancelled", changedAt: new Date() });
      order.cancelledAt = new Date();
      order.cancellationReason = reason;
      order.cancelledBy = "system";
      await order.save();

      await restoreStock(verifiedItems);

      if (pointsActuallyDeducted) {
        await refundRedeemedPoints({ order });
      }

      if (order.firstOrderCouponApplied) {
        await User.updateOne(
          { _id: req.user._id },
          { $set: { firstOrderCouponUsed: false } },
        );
      }

      return res.status(statusCode).json({ success: false, message });
    };

    if (pointsRedeemed > 0) {
      const pointsResult = await applyLoyaltyPointsChange({
        userId: req.user._id,
        type: "redeemed",
        source: "order",
        points: -pointsRedeemed,
        key: `redeem:order:${order._id}`,
        order: order._id,
        description: `Redeemed on order ${order._id}`,
      });

      // null means the spendable balance no longer covers pointsRedeemed
      // — e.g. two tabs/requests redeeming near-simultaneously, or a batch
      // expiring in between; the deduction is all-or-nothing.
      if (!pointsResult) {
        return cancelAndReject(
          "Your loyalty points balance changed — please review your order and try again.",
        );
      }

      pointsActuallyDeducted = true;
    }

    // Same race, for a first-order-only coupon: the eligibility check
    // above (isEligibleForFirstOrderCoupon) only reads how many prior
    // orders exist, so two concurrent checkouts from the same
    // brand-new user could both pass it and both get the discount.
    // User.firstOrderCouponUsed is claimed atomically here — whichever
    // request wins the race sets it from false to true; the other gets
    // null back and must not keep a discount it was never actually
    // the first to redeem.
    if (appliedFirstOrderCoupon) {
      const couponClaim = await User.findOneAndUpdate(
        { _id: req.user._id, firstOrderCouponUsed: { $ne: true } },
        { $set: { firstOrderCouponUsed: true } },
      );

      if (!couponClaim) {
        return cancelAndReject(
          "This coupon has already been used on another order — please review your order and try again.",
        );
      }

      order.firstOrderCouponApplied = true;
      await order.save();
    }

    await CartSnapshot.deleteOne({ user: req.user._id });

    // Razorpay order is created from the same server-computed totalPrice
    // used above — never trust a client-supplied amount for payment.
    let razorpayOrder = null;

    if (paymentMethod === "Razorpay") {
      try {
        razorpayOrder = await getRazorpay().orders.create({
          amount: Math.round(totalPrice * 100), // paise
          currency: "INR",
          receipt: order._id.toString(),
        });

        order.razorpayOrderId = razorpayOrder.id;
        await order.save();
      } catch (razorpayError) {
        console.error("Razorpay Order Create Error:", razorpayError);

        // Stock, any redeemed points, and a claimed first-order coupon
        // were all already committed above before this Razorpay API
        // call — a transient Razorpay failure here must not leave them
        // stranded against an order that can never be paid. Reuses the
        // exact same rollback cancelAndReject already does for the
        // points/coupon race cases, rather than leaving a phantom
        // "Pending" order with no razorpayOrderId.
        return cancelAndReject(
          "Unable to initiate payment. Please try again.",
          500,
          "payment_init_failed",
        );
      }
    }

    // "Order placed" confirmation — distinct from the status-change emails
    // updateOrderStatus sends later (Processing/Shipped/Delivered/
    // Cancelled). Fires for every payment method, including a Razorpay
    // order not yet paid — this confirms the order was received, not that
    // payment succeeded. Never blocks the actual order response on failure.
    try {
      const isHindi = req.user.preferredLanguage === "hi";
      // Item NAMES stay English either way -- Product has no nameHi-
      // equivalent translation wired into order line items yet (that's
      // the separate product-spec-Hindi-fields item from this same
      // round's scope, not done here), only the surrounding email copy
      // is localized.
      const itemsListHtml = verifiedItems
        .map(
          (item) =>
            `<li>${escapeHtml(item.name)}${item.size ? ` (${isHindi ? "साइज़" : "Size"}: ${escapeHtml(item.size)})` : ""} × ${item.quantity} — ₹${item.price * item.quantity}</li>`,
        )
        .join("");

      await sendEmail({
        to: req.user.email,
        bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: isHindi
          ? "आपका Mittal Collections ऑर्डर कन्फर्म हो गया है"
          : "Your Mittal Collections order is confirmed",
        html: isHindi
          ? `
          <p>नमस्ते ${escapeHtml(req.user.name || "")},</p>
          <p>आपके ऑर्डर के लिए धन्यवाद! यहां एक छोटा सारांश है:</p>
          <p>ऑर्डर आईडी: ${order._id}</p>
          <ul>
            ${itemsListHtml}
          </ul>
          <p><strong>कुल: ₹${totalPrice}</strong></p>
          <p>भुगतान का तरीका: ${paymentMethod}</p>
          <p><a href="${process.env.CLIENT_URL}/my-orders/${order._id}">अपना ऑर्डर देखें</a></p>
        `
          : `
          <p>Hi ${escapeHtml(req.user.name || "there")},</p>
          <p>Thanks for your order! Here's a quick summary:</p>
          <p>Order ID: ${order._id}</p>
          <ul>
            ${itemsListHtml}
          </ul>
          <p><strong>Total: ₹${totalPrice}</strong></p>
          <p>Payment method: ${paymentMethod}</p>
          <p><a href="${process.env.CLIENT_URL}/my-orders/${order._id}">View your order</a></p>
        `,
      });
    } catch (error) {
      console.error("Order Confirmation Email Error:", error);
    }

    res.status(201).json({
      success: true,
      order,
      razorpayOrder: razorpayOrder
        ? {
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
          }
        : null,
      razorpayKeyId: razorpayOrder ? process.env.RAZORPAY_KEY_ID : null,
    });
  } catch (error) {
    console.error("Create Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Resume Razorpay Payment
// ============================
// For an order whose payment stalled, failed, or was dismissed —
// re-opens the SAME Razorpay order created at checkout time (never a
// new one), so verifyRazorpayPayment's existing user+razorpayOrderId
// lookup keeps working unchanged. Stops working once the stale-order
// cron cancels the order (see cancelStaleRazorpayOrders).
export const resumeRazorpayPayment = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.paymentMethod !== "Razorpay" || !order.razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message: "This order isn't a Razorpay payment.",
      });
    }

    if (order.isPaid || order.orderStatus === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: order.isPaid
          ? "This order has already been paid."
          : "This order has been cancelled — please place a new order.",
      });
    }

    // Razorpay's own view of the order and its payments decides, through
    // the same reconcileRazorpayOrder the pending-payment cron and Convert
    // to COD use. This used to reopen checkout unless the Razorpay order
    // was already "paid" -- so a customer whose earlier payment was
    // authorized but not yet captured (a slow bank or UPI) could pay a
    // second time -- and its self-heal marked the order paid without
    // checking what was actually captured (deep bug sweep, 2026-10-28).
    const check = await reconcileRazorpayOrder(order, getPendingPaymentConfig());

    // Payment actually succeeded on Razorpay's side but our own
    // verification step never ran (e.g. the browser closed right after
    // the bank redirect) — reopening the modal here would let the
    // customer pay a second time for the same order. This used to just
    // detect that and tell the customer to wait, throwing away proof
    // of payment it had already fetched -- the order stayed "Pending"/
    // unpaid until the pending-payment cron eventually caught it.
    // Self-heals immediately instead, through the same atomic
    // markOrderPaid every other payment path uses (two tabs hitting
    // "Pay Now" at once shouldn't both fire the notification below)
    // (deep bug sweep, 2026-10-20).
    if (check.verdict === "PAID") {
      const result = await markOrderPaid({
        orderId: order._id,
        razorpayOrderId: order.razorpayOrderId,
        paymentId: check.paymentId,
        source: "resume",
      });

      if (result.status === "paid") {
        notifyUser({
          userId: order.user,
          type: "order_status",
          title: "Payment confirmed",
          message: `We've confirmed your payment for order ${order._id} — it's now being processed.`,
          link: `/my-orders/${order._id}`,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          "This order has already been paid — we've updated it, please refresh the page.",
      });
    }

    // Money was captured, but not the amount/currency this order asked
    // for: never marked paid here — an admin checks it, same as the cron.
    if (check.verdict === "MISMATCH") {
      await flagPaymentReview(order._id, "amount_mismatch");

      return res.status(409).json({
        success: false,
        message:
          "We've received a payment for this order that we need to check before confirming it — please don't pay again. We'll update you shortly.",
      });
    }

    if (check.verdict === "AUTHORIZED") {
      return res.status(409).json({
        success: false,
        message:
          "Your earlier payment for this order is still being confirmed by your bank — please don't pay again. Check back in a few minutes.",
      });
    }

    // Couldn't tell what Razorpay has (API error, odd response): fail
    // closed rather than risk a second charge.
    if (check.verdict === "INCONCLUSIVE") {
      console.error(`Resume Razorpay Payment Check Error (order ${order._id}):`, check.error);

      return res.status(502).json({
        success: false,
        message: "We couldn't check this order's payment status right now — please try again in a minute.",
      });
    }

    // UNPAID or IN_FLIGHT: nothing taken yet, so checkout can be retried
    // (an attempt still in flight isn't blocked — that would stop a
    // customer from retrying an abandoned attempt for half an hour).
    res.status(200).json({
      success: true,
      razorpayOrder: {
        id: check.razorpayOrder.id,
        amount: check.razorpayOrder.amount,
        currency: check.razorpayOrder.currency,
      },
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Resume Razorpay Payment Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Verify Razorpay Payment
// ============================
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !orderId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing payment details",
      });
    }

    // Plain strings only — these go into database queries, and a JSON
    // object here (e.g. {"$ne": ""}) would otherwise act as a query
    // operator.
    if (
      typeof orderId !== "string" ||
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment details",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
      razorpayOrderId: razorpay_order_id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    // Constant-time compare, like the webhook's: a plain !== returns
    // early at the first differing character. The format check first
    // guarantees both buffers are the same 32 bytes timingSafeEqual
    // requires (it throws on a length mismatch).
    const signatureMatches =
      /^[0-9a-f]{64}$/i.test(razorpay_signature) &&
      crypto.timingSafeEqual(
        Buffer.from(razorpay_signature, "hex"),
        Buffer.from(expectedSignature, "hex"),
      );

    if (!signatureMatches) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    // A valid signature means Razorpay genuinely took the money,
    // regardless of what state our own order is in. markOrderPaid records
    // that atomically and, if the order had meanwhile been cancelled (the
    // pending-payment cron, possibly with its stock already sold on) or
    // switched to Cash on Delivery by an admin, flags it for manual
    // review and alerts the admin instead of reviving it. Re-verifying an
    // already-paid order is a harmless no-op.
    const result = await markOrderPaid({
      orderId: order._id,
      razorpayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      source: "verify",
    });
    const paidOrder = result.order || order;
    const lateReason = paidOrder.paidAfterCancellation ? paidOrder.paymentReviewReason : null;

    res.status(200).json({
      success: true,
      message:
        lateReason === "paid_after_cod_conversion"
          ? "Payment received. This order had been switched to Cash on Delivery — please don't pay again on delivery; our team will confirm with you shortly."
          : lateReason
            ? "Payment received. This order was already cancelled — our team will confirm with you shortly."
            : "Payment verified successfully",
      // Lets the client fire a GA4 `purchase` event from the order's own
      // confirmed line items — needed specifically by the "Pay Now" resume
      // flow (razorpay.js), which has no live cart to build one from.
      order: paidOrder,
    });
  } catch (error) {
    console.error("Verify Razorpay Payment Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Logged In User Orders
// ============================

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user._id,
    })
      .populate("orderItems.product", "isReturnable returnPeriodDays")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      orders: await attachReturnEligibility(orders),
    });
  } catch (error) {
    console.error("Get Orders Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get All Orders (Admin)
// ============================

export const getAllOrders = async (req, res) => {
  try {
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    // Safety ceiling, not real pagination — this endpoint has always
    // returned every order at once (the admin UI does its own client-
    // side search/filter over the full list), which is fine while the
    // order count is small. 2000 is far above anything this site has
    // today; it exists so the collection can't grow completely unbounded
    // into this response. Revisit with real page/limit params (matching
    // productController.js's pattern) once order volume actually
    // approaches this.
    const orders = await Order.find()
      .populate("user", "name email mobile")
      .sort({ createdAt: sortOrder })
      .limit(2000);

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Get All Orders Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Single Order
// ============================

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "name email mobile")
      .populate("orderItems.product", "isReturnable returnPeriodDays");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Security check: sirf order ka owner ya "orders"-permitted admin hi
    // ise dekh sake. req.user.role === "admin" alone isn't enough — a
    // restricted staff account without the "orders" permission is
    // already blocked from the order LIST (see orderRoutes.js's `perm`
    // on GET "/"); checking only role here let that same account view
    // any individual order just by guessing/enumerating its ID.
    const isOwner = order.user._id.toString() === req.user._id.toString();
    const isAdmin = hasAdminPermission(req.user, "orders");

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. This is not your order.",
      });
    }

    res.status(200).json({
      success: true,
      order: await attachReturnEligibility(order),
    });
  } catch (error) {
    console.error("Get Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Mark Order Seen (Admin)
// ============================

export const markOrderSeen = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.isSeenByAdmin = true;

    await order.save();

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Mark Order Seen Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Non-terminal statuses have a real progression — Pending < Processing <
// Shipped < Delivered. A transition is only valid if it either moves
// forward through that order (skipping ahead is fine, e.g. Pending
// straight to Delivered for a quick local order) or moves to Cancelled
// from any of them (the supported return/cancellation flow). Cancelled
// itself is terminal — nothing moves out of it.
//
// UAT found a live exploit chain that relied on both of these being
// unenforced: Cancelled -> Delivered (an illegal "un-cancel" that
// re-credits loyalty points without ever re-reserving stock) -> Pending
// (a backward jump) -> Cancelled again -> restoreStock fires a second
// time for stock that was never re-reserved, permanently inflating the
// product's stock count by the order quantity.
const ORDER_STATUS_RANK = { Pending: 0, Processing: 1, Shipped: 2, Delivered: 3 };

const isValidStatusTransition = (from, to) => {
  if (from === "Cancelled") return false;
  if (to === "Cancelled") return true;
  if (!(from in ORDER_STATUS_RANK) || !(to in ORDER_STATUS_RANK)) return false;

  // >= (not just >) so re-applying the same status is a harmless no-op —
  // existing handlers (e.g. loyalty crediting) already guard against
  // double-processing an unchanged status.
  return ORDER_STATUS_RANK[to] >= ORDER_STATUS_RANK[from];
};

// ============================
// Update Order Status (Admin)
// ============================

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    let order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.isActive) {
      return res.status(400).json({
        success: false,
        message: "This order is deleted — restore it before changing its status",
      });
    }

    if (!isValidStatusTransition(order.orderStatus, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from "${order.orderStatus}" to "${status}".`,
      });
    }

    const originalStatus = order.orderStatus;
    const wasAlreadyCancelled = order.orderStatus === "Cancelled";
    const isFirstDelivery = status === "Delivered" && originalStatus !== "Delivered";

    const setFields = { orderStatus: status };

    // Points earned on delivery are pending, not credited: they become
    // spendable only once every item's return window has closed with no
    // return still open (creditDueOrderPoints, run by the loyalty cron).
    // Re-saving an already-Delivered order changes none of this — it used
    // to restart deliveredAt, quietly extending the return window.
    if (isFirstDelivery) {
      const deliveredAt = new Date();
      const loyaltySettings = await getLoyaltySettings();
      const earnBase = eligibleEarnBase(order);

      setFields.deliveredAt = deliveredAt;
      setFields.loyaltyEarnBase = earnBase;
      setFields.pointsEarned = pointsEarnedFor(earnBase, loyaltySettings.earnRate);
      setFields.pointsAvailableAt = await pointsAvailableAtFor(order, deliveredAt);
    }

    // Atomic claim, same mechanism this function already uses a few lines
    // down for referralRewarded (see that comment for the fuller
    // explanation) — but until now only applied to the referral payout,
    // not to the status transition itself. Order has no
    // optimisticConcurrency (unlike Product; confirmed via
    // cancelStaleRazorpayOrders' own comment on the identical gap), so
    // the plain findById-then-save this replaced gave two admin requests
    // racing the same transition (double-click, two open tabs) no
    // protection: both would read the same pre-update order, both pass
    // the checks above, and both run the Cancelled branch's
    // restoreStock/loyalty-refund/clawback side effects twice, or both
    // credit Delivered's pointsEarned twice (deep bug sweep, 2026-10-13).
    // Scoping the filter to the order's status AT READ TIME means a
    // losing concurrent request's update simply matches nothing.
    //
    // A cancellation runs that claim and everything it gives back (stock,
    // points, coupon, referral bonus) in one transaction: either all of
    // it happens or none of it does, so a crash part-way can't leave a
    // Cancelled order with its stock still out.
    const isCancelling = status === "Cancelled" && !wasAlreadyCancelled;
    let restocked = [];

    const claimOrder = async (session) => {
      const claim = await Order.findOneAndUpdate(
        { _id: order._id, orderStatus: originalStatus },
        {
          $set: isCancelling
            ? {
                ...setFields,
                cancelledAt: new Date(),
                cancellationReason: "admin",
                cancelledBy: String(req.user._id),
              }
            : setFields,
          $push: { statusHistory: { status, changedAt: new Date() } },
        },
        { new: true, session },
      );

      if (claim && isCancelling) {
        restocked = await releaseOrderResources(claim, { session });
      }

      return claim;
    };

    let claimed;

    try {
      claimed = isCancelling ? await withOptionalTransaction(claimOrder) : await claimOrder(null);
    } catch (error) {
      if (!(error instanceof TransactionsUnavailableError)) throw error;

      return res.status(503).json({
        success: false,
        message: "Cancelling orders is temporarily unavailable — nothing was changed, please try again shortly.",
      });
    }

    if (!claimed) {
      return res.status(409).json({
        success: false,
        message: "This order's status was just changed elsewhere — refresh and try again.",
      });
    }

    order = claimed;

    if (isCancelling) {
      notifyRestocked(restocked);
    } else if (isFirstDelivery && order.pointsEarned > 0) {
      // The referral bonus (for a referred customer's first kept order)
      // is paid by the same job, once this order's return window closes.
      notifyUser({
        userId: order.user,
        type: "loyalty_points",
        title: "Loyalty points on their way",
        message: `${order.pointsEarned} points from this order become available on ${order.pointsAvailableAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}, once the return window closes.`,
        link: "/loyalty-history",
      });
    }

    // Shipped/Delivered orders post their sale; a cancel voids it.
    await postSafely(syncOrder, order._id);

    sendOrderStatusNotification(order, status);

    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order,
    });
  } catch (error) {
    console.error("Update Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Restore Order (Admin)
// ============================

export const restoreOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.isActive = true;
    await order.save();
    await postSafely(syncOrder, order._id);

    res.json({
      success: true,
      message: "Order restored successfully",
      order,
    });
  } catch (error) {
    console.error("Restore Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to restore order",
    });
  }
};

// ============================
// Delete Order (Admin)
// ============================

export const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.orderStatus !== "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Only cancelled orders can be deleted",
      });
    }

    order.isActive = false;
    await order.save();
    await postSafely(syncOrder, order._id);

    res.json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("Delete Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete order",
    });
  }
};

// ============================
// Permanently Delete Order (Admin)
// ============================

export const permanentlyDeleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.orderStatus !== "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Only cancelled orders can be permanently deleted",
      });
    }

    if (order.isActive) {
      return res.status(400).json({
        success: false,
        message: "Delete this order first before removing it permanently",
      });
    }

    const [hasReturnRequests, hasTickets] = await Promise.all([
      ReturnRequest.exists({ order: order._id }),
      Ticket.exists({ order: order._id }),
    ]);

    if (hasReturnRequests || hasTickets) {
      return res.status(400).json({
        success: false,
        message:
          "This order has a linked return request or support ticket and cannot be permanently deleted",
      });
    }

    await order.deleteOne();
    await postSafely(syncOrder, order._id);

    res.json({
      success: true,
      message: "Order permanently deleted",
    });
  } catch (error) {
    console.error("Permanently Delete Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to permanently delete order",
    });
  }
};

// ============================
// Send Review Request Emails
// Called by an external scheduler (not a logged-in admin session),
// protected by a shared secret rather than JWT auth — same pattern as
// cartController.js's sendAbandonedCartReminders.
// ============================

export const sendReviewRequestEmails = async (req, res) => {
  try {

    const cutoff = new Date(
      Date.now() - REVIEW_REQUEST_DELAY_DAYS * 24 * 60 * 60 * 1000,
    );

    const orders = await Order.find({
      orderStatus: "Delivered",
      deliveredAt: { $lte: cutoff },
      reviewRequestSent: { $ne: true },
    })
      .populate("user", "name email")
      .populate("orderItems.product", "slug");

    let sent = 0;

    for (const order of orders) {
      if (!order.user?.email) continue;

      // Atomic per-order claim before sending — the N+1 fix (2026-10-13)
      // that batched this into one Order.updateMany AFTER the whole send
      // loop finished widened the window two overlapping cron runs (the
      // route comments elsewhere already acknowledge pingers like
      // cron-job.org retry/double-fire) could both fetch the same
      // not-yet-flagged order and send a duplicate "leave a review"
      // email — found in the 2026-10-13 deep bug sweep. Claiming here,
      // before the send, closes that; the catch block below releases the
      // claim on a genuine send failure so it's still retried next run.
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, reviewRequestSent: { $ne: true } },
        { $set: { reviewRequestSent: true } },
      );

      if (!claimed) continue;

      const itemsHtml = order.orderItems
        .map((item) => {
          const product = item.product;
          const isPopulated = product && typeof product === "object";
          const productId = isPopulated ? product._id : product;

          if (!productId) return `<li>${escapeHtml(item.name)}</li>`;

          // #reviews scrolls straight to (and auto-opens) the review form
          // — see ProductReviews.jsx — instead of leaving the customer to
          // find it themselves on a page they otherwise land on at the top.
          const url = `${process.env.CLIENT_URL}/product/${productId}${
            isPopulated && product.slug ? `/${product.slug}` : ""
          }#reviews`;

          return `<li>${escapeHtml(item.name)} — <a href="${url}">Leave a review</a></li>`;
        })
        .join("");

      try {
        await sendEmail({
          to: order.user.email,
          bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
          subject: "How was your order? Leave a review",
          html: `
            <p>Hi ${escapeHtml(order.user.name || "there")},</p>
            <p>Hope you're enjoying your order from Mittal Collections! Got a
            minute to share what you think? It really helps other shoppers.</p>
            <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;font-weight:bold;color:#92400e;">
                🎁 Mittal Collections is rewarding you — leave a review and get
                ${REVIEW_BONUS_POINTS} bonus loyalty points!
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#92400e;">
                *Points are credited once your review is approved. Terms and
                conditions apply.
              </p>
            </div>
            <ul>${itemsHtml}</ul>
            <p>Order ID: ${order._id}</p>
          `,
        });

        sent += 1;
      } catch (error) {
        console.error(`Review request email failed for ${order.user.email}:`, error);
        // Release the claim made above so a genuine send failure (not a
        // concurrent-run race) still gets retried on the next cron run,
        // instead of being permanently marked "sent" with no email ever
        // having gone out.
        await Order.updateOne(
          { _id: order._id },
          { $set: { reviewRequestSent: false } },
        );
      }
    }

    res.status(200).json({
      success: true,
      message: `Sent ${sent} of ${orders.length} review requests`,
      sent,
      total: orders.length,
    });
  } catch (error) {
    console.error("Send Review Request Emails Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Pending Razorpay Payments: reminders, auto-cancel, late-payment checks
// ============================
// Called by cron-job.org (CRON_SECRET, not JWT) — every few minutes. A
// Razorpay order reserves stock (and any redeemed points / first-order
// coupon) the moment it's created, before payment succeeds. Each run:
//
//   1. Unpaid Razorpay orders with something due: asks Razorpay first,
//      then sends reminder #1 / reminder #2 or auto-cancels, using the
//      timings in config/pendingPayment.js. A payment that is captured is
//      recorded; one that is authorized, still in flight, or can't be
//      confirmed is never cancelled — it is rechecked with backoff and
//      handed to an admin (paymentReviewNeeded) once the deadline passes.
//   2. Orders the cron or an admin cancelled, and orders an admin switched to COD,
//      are rechecked for a few days for money that arrives late.
//   3. Messages whose send failed earlier are retried.
//
// Everything is driven by due times stored on the order, so a missed or
// late run (Render cold start, downtime) simply catches up on the next
// one, and every action is claimed atomically, so overlapping runs can't
// send twice or cancel twice. The handler keeps its old name and URL
// (/cancel-stale-razorpay) so the existing cron-job.org job keeps working.

const MINUTE = 60 * 1000;
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * MINUTE);

// Razorpay's view of an order, reduced to one decision:
//   PAID         a captured payment for the right amount
//   MISMATCH     captured, but the amount/currency doesn't match
//   AUTHORIZED   money blocked, not captured (we never capture it)
//   IN_FLIGHT    a payment attempt started recently and may still succeed
//   UNPAID       nothing paid and nothing pending
//   INCONCLUSIVE couldn't tell (API error, timeout, odd response)
const reconcileRazorpayOrder = async (order, { inFlightGraceMinutes }) => {
  if (!order.razorpayOrderId) {
    return { verdict: "INCONCLUSIVE", error: "order has no razorpayOrderId" };
  }

  let razorpayOrder;
  let payments;

  try {
    razorpayOrder = await getRazorpay().orders.fetch(order.razorpayOrderId);
    ({ items: payments } = await getRazorpay().orders.fetchPayments(order.razorpayOrderId));
  } catch (error) {
    return { verdict: "INCONCLUSIVE", error: error?.message || String(error) };
  }

  if (!razorpayOrder || !Array.isArray(payments)) {
    return { verdict: "INCONCLUSIVE", error: "unexpected Razorpay response" };
  }

  const captured = payments.find((p) => p.status === "captured");

  if (captured) {
    // razorpayOrder.amount is what createOrder asked Razorpay to collect;
    // while the order is still a Razorpay order it must also equal our
    // own total (a COD-converted order's total has since changed).
    const matches =
      captured.amount === razorpayOrder.amount &&
      captured.currency === "INR" &&
      (order.paymentMethod !== "Razorpay" ||
        razorpayOrder.amount === Math.round(order.totalPrice * 100));

    return matches
      ? { verdict: "PAID", paymentId: captured.id }
      : { verdict: "MISMATCH", paymentId: captured.id };
  }

  // "paid" with no captured payment in the list shouldn't happen — don't
  // guess either way.
  if (razorpayOrder.status === "paid") {
    return { verdict: "INCONCLUSIVE", error: "order paid but no captured payment listed" };
  }

  if (payments.some((p) => p.status === "authorized")) return { verdict: "AUTHORIZED" };

  const graceStart = Date.now() - inFlightGraceMinutes * MINUTE;
  const inFlight = payments.some(
    (p) => p.status === "created" && (!p.created_at || p.created_at * 1000 > graceStart),
  );

  // razorpayOrder: what resumeRazorpayPayment reopens checkout with.
  return { verdict: inFlight ? "IN_FLIGHT" : "UNPAID", razorpayOrder };
};

// Answers that mean money may already have been taken — convertOrderToCod
// refuses on these (and on IN_FLIGHT / INCONCLUSIVE).
const PAYMENT_TAKEN_VERDICTS = ["PAID", "MISMATCH", "AUTHORIZED"];

const notifyPaymentNotice = (order, title) =>
  notifyUser({
    userId: order.user,
    type: "order_status",
    title,
    message: `Order ID: ${order._id}`,
    link: `/my-orders/${order._id}`,
  });

const logPending = (order, action, extra = "") =>
  console.log(`[pending-payment] order=${order._id} action=${action}${extra ? ` ${extra}` : ""}`);

// Auto-cancel for non-payment: status claim + stock / points / coupon
// release in one transaction (see releaseOrderResources), then the
// customer's cancellation message.
const cancelForPaymentTimeout = async (order) => {
  let restocked = [];

  const cancelled = await withOptionalTransaction(async (session) => {
    const claim = await Order.findOneAndUpdate(
      {
        _id: order._id,
        orderStatus: "Pending",
        paymentMethod: "Razorpay",
        isPaid: { $ne: true },
        paymentReviewNeeded: { $ne: true },
      },
      {
        $set: {
          orderStatus: "Cancelled",
          cancelledAt: new Date(),
          cancellationReason: "payment_timeout",
          cancelledBy: "system",
          nextPaymentCheckAt: null,
        },
        $push: { statusHistory: { status: "Cancelled", changedAt: new Date() } },
      },
      { new: true, session },
    );

    if (!claim) return null;

    restocked = await releaseOrderResources(claim, {
      session,
      refundDescription: `Refund for unpaid Razorpay order ${claim._id}`,
    });

    return claim;
  });

  if (!cancelled) return null;

  notifyRestocked(restocked);
  await postSafely(syncOrder, cancelled._id);

  return cancelled;
};

const sendTimeoutCancelNotice = (orderId) =>
  sendPaymentNotice({
    orderId,
    notice: "timeoutCancel",
    filter: { orderStatus: "Cancelled", cancellationReason: "payment_timeout" },
    notify: notifyPaymentNotice,
  });

const processDueOrder = async (order, cfg, counters, canCancel) => {
  const now = Date.now();
  const ageMinutes = (now - new Date(order.createdAt).getTime()) / MINUTE;
  const cancelAt = new Date(new Date(order.createdAt).getTime() + cfg.autoCancelMinutes * MINUTE);
  const pastDeadline = ageMinutes >= cfg.autoCancelMinutes;

  const result = await reconcileRazorpayOrder(order, cfg);

  if (result.verdict === "INCONCLUSIVE") {
    const failures = (order.paymentCheckFailures || 0) + 1;

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentCheckFailures: failures,
          lastPaymentCheckError: String(result.error).slice(0, 300),
          nextPaymentCheckAt: minutesFromNow(Math.min(60, 5 * 2 ** (failures - 1))),
        },
      },
    );

    counters.skippedInconclusive += 1;
    logPending(order, "inconclusive", `failures=${failures} error="${result.error}"`);

    if (pastDeadline && failures >= cfg.checkMaxFailures) {
      if (await flagPaymentReview(order._id, "check_inconclusive")) counters.flaggedReview += 1;
    }

    return;
  }

  // Any conclusive answer resets the failure streak.
  const conclusive = { paymentCheckFailures: 0, lastPaymentCheckError: null };

  if (result.verdict === "PAID") {
    const paid = await markOrderPaid({
      orderId: order._id,
      razorpayOrderId: order.razorpayOrderId,
      paymentId: result.paymentId,
      source: "cron",
    });

    if (paid.status === "paid") {
      await Order.updateOne({ _id: order._id }, { $set: conclusive });
      counters.recovered += 1;
      logPending(order, "recovered-paid", `payment=${result.paymentId}`);
      if (!paid.order.paidAfterCancellation) notifyPaymentConfirmed(paid.order);
    }

    return;
  }

  if (result.verdict === "MISMATCH" || result.verdict === "AUTHORIZED") {
    await Order.updateOne(
      { _id: order._id },
      { $set: { ...conclusive, nextPaymentCheckAt: minutesFromNow(15) } },
    );
    logPending(order, result.verdict.toLowerCase());

    if (result.verdict === "MISMATCH" || pastDeadline) {
      const reason = result.verdict === "MISMATCH" ? "amount_mismatch" : "authorized_uncaptured";
      if (await flagPaymentReview(order._id, reason)) counters.flaggedReview += 1;
    }

    return;
  }

  if (result.verdict === "IN_FLIGHT") {
    await Order.updateOne({ _id: order._id }, { $set: { ...conclusive, nextPaymentCheckAt: minutesFromNow(5) } });
    counters.skippedInFlight += 1;
    logPending(order, "in-flight");
    return;
  }

  // UNPAID. A review opened for an authorized / inconclusive payment that
  // has since cleared (failed, refunded, expired) goes back to the normal
  // schedule.
  if (order.paymentReviewNeeded) {
    await Order.updateOne(
      { _id: order._id, paymentReviewNeeded: true },
      {
        $set: {
          paymentReviewNeeded: false,
          paymentReviewResolvedAt: new Date(),
          paymentReviewResolvedBy: "system",
        },
      },
    );
    logPending(order, "review-cleared", `reason=${order.paymentReviewReason}`);
  }

  if (pastDeadline) {
    if (!canCancel) {
      // Never cancel without a transaction (see withOptionalTransaction):
      // stock / points / coupon must be released together with the status.
      await Order.updateOne({ _id: order._id }, { $set: { ...conclusive, nextPaymentCheckAt: minutesFromNow(15) } });
      counters.cancelSkippedNoTransactions += 1;
      logPending(order, "cancel-skipped", "reason=no-transaction-support");
      return;
    }

    const cancelled = await cancelForPaymentTimeout(order);

    if (cancelled) {
      await Order.updateOne(
        { _id: order._id },
        { $set: { ...conclusive, nextPaymentCheckAt: minutesFromNow(30) } },
      );
      counters.cancelled += 1;
      logPending(order, "auto-cancelled");
      if ((await sendTimeoutCancelNotice(order._id)) === "failed") counters.noticeFailures += 1;
    }

    return;
  }

  // Only the latest due stage is sent: after downtime an order first seen
  // at 4 hours gets reminder #2, not both.
  const unpaidFilter = {
    orderStatus: "Pending",
    paymentMethod: "Razorpay",
    isPaid: { $ne: true },
    paymentReviewNeeded: { $ne: true },
  };
  let noticeFailed = false;
  let leaseRetryAt = null;

  if (cfg.remindersEnabled) {
    const reminder2Due = ageMinutes >= cfg.reminder2Minutes;
    const notice = reminder2Due ? "reminder2" : "reminder1";
    const alreadySent =
      order.paymentNotices?.reminder2?.sentAt || (!reminder2Due && order.paymentNotices?.reminder1?.sentAt);

    if (!alreadySent) {
      const outcome = await sendPaymentNotice({
        orderId: order._id,
        notice,
        filter: unpaidFilter,
        expiresAt: cancelAt,
        notify: notifyPaymentNotice,
      });

      if (outcome === "sent") {
        counters[notice === "reminder1" ? "reminded1" : "reminded2"] += 1;
        logPending(order, notice);
      } else if (outcome === "failed") {
        counters.noticeFailures += 1;
        noticeFailed = true;
      } else if (outcome === "leased") {
        // Another run holds the claim — or crashed holding it. Look again
        // just after the lease runs out instead of jumping to the next
        // stage, so a crashed send isn't silently dropped.
        leaseRetryAt = new Date(Date.now() + NOTICE_LEASE_MS + MINUTE);
        logPending(order, `${notice}-leased`);
      }
    }
  }

  // Next look: the next stage's due time (or straight away if a send just
  // failed and should be retried).
  const nextStageAt =
    ageMinutes < cfg.reminder2Minutes
      ? new Date(new Date(order.createdAt).getTime() + cfg.reminder2Minutes * MINUTE)
      : cancelAt;

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        ...conclusive,
        nextPaymentCheckAt: noticeFailed
          ? new Date()
          : new Date(Math.min(nextStageAt, cancelAt, leaseRetryAt ?? Infinity)),
      },
    },
  );
};

// A cancelled (or COD-converted) order whose Razorpay payment lands late:
// recorded and flagged for an admin, never revived automatically.
const recheckClosedOrder = async (order, cfg, counters) => {
  const result = await reconcileRazorpayOrder(order, cfg);

  if (result.verdict === "PAID") {
    const paid = await markOrderPaid({
      orderId: order._id,
      razorpayOrderId: order.razorpayOrderId,
      paymentId: result.paymentId,
      source: "cron",
    });

    if (paid.status === "paid") {
      counters.latePayments += 1;
      logPending(order, "late-payment", `payment=${result.paymentId}`);
    }
  } else if (result.verdict === "AUTHORIZED" || result.verdict === "MISMATCH") {
    const reason = result.verdict === "AUTHORIZED" ? "authorized_uncaptured" : "amount_mismatch";
    if (await flagPaymentReview(order._id, reason)) counters.flaggedReview += 1;
  }

  await Order.updateOne({ _id: order._id }, { $set: { nextPaymentCheckAt: minutesFromNow(30) } });
};

const dueNow = () => ({ $or: [{ nextPaymentCheckAt: null }, { nextPaymentCheckAt: { $lte: new Date() } }] });

export const cancelStaleRazorpayOrders = async (req, res) => {
  try {
    const cfg = getPendingPaymentConfig();
    const canCancel = await transactionsSupported();
    const counters = {
      cancelled: 0,
      recovered: 0,
      reminded1: 0,
      reminded2: 0,
      skippedInFlight: 0,
      skippedInconclusive: 0,
      flaggedReview: 0,
      latePayments: 0,
      noticeFailures: 0,
      noticesRetried: 0,
      cancelSkippedNoTransactions: 0,
      errors: 0,
    };

    // Each order in its own try/catch: one bad record must not stop the
    // rest of the batch.
    const eachSafely = async (orders, fn) => {
      for (const order of orders) {
        try {
          await fn(order);
        } catch (error) {
          counters.errors += 1;
          console.error(`[pending-payment] order=${order._id} error:`, error);
        }
      }
    };

    // 1. Unpaid Razorpay orders with something due. COD orders never match.
    const firstStageMinutes = Math.min(cfg.reminder1Minutes, cfg.autoCancelMinutes);
    const due = await Order.find({
      paymentMethod: "Razorpay",
      orderStatus: "Pending",
      isPaid: { $ne: true },
      createdAt: { $lte: new Date(Date.now() - firstStageMinutes * MINUTE) },
      ...dueNow(),
    })
      .sort({ createdAt: 1 })
      .limit(cfg.batchSize);

    await eachSafely(due, (order) => processDueOrder(order, cfg, counters, canCancel));

    // 2. Late money on orders the cron or an admin cancelled, or an admin
    // moved to COD. Only recorded and flagged — never revived, no stock change.
    const recheckSince = new Date(Date.now() - cfg.postCancelRecheckHours * 60 * MINUTE);
    const closed = await Order.find({
      isPaid: { $ne: true },
      razorpayOrderId: { $nin: ["", null] },
      $and: [
        {
          $or: [
            { cancellationReason: "payment_timeout", cancelledAt: { $gte: recheckSince } },
            // An admin can cancel an unpaid Razorpay order while a payment
            // is still on its way — same late-money risk.
            {
              cancellationReason: "admin",
              paymentMethod: "Razorpay",
              cancelledAt: { $gte: recheckSince },
            },
            { convertedToCodAt: { $gte: recheckSince } },
          ],
        },
        dueNow(),
      ],
    })
      .sort({ updatedAt: 1 })
      .limit(cfg.batchSize);

    await eachSafely(closed, (order) => recheckClosedOrder(order, cfg, counters));

    // 3. Retries: cancellation messages and admin review alerts whose send
    // failed or was interrupted, plus one follow-up after 24h unresolved.
    // Orders already handled above wait for the next run, so one failing
    // send isn't immediately retried in the same run (that would burn two
    // of its attempts in a single outage).
    const { reminderMaxAttempts } = cfg;
    const handledThisRun = [...due, ...closed].map((order) => order._id);
    const retryable = (path) => ({
      _id: { $nin: handledThisRun },
      [`paymentNotices.${path}.sentAt`]: null,
      [`paymentNotices.${path}.attempts`]: { $not: { $gte: reminderMaxAttempts } },
    });

    const pendingCancelNotices = await Order.find({
      cancellationReason: "payment_timeout",
      cancelledAt: { $gte: recheckSince },
      ...retryable("timeoutCancel"),
    })
      .select("_id")
      .limit(cfg.batchSize);

    await eachSafely(pendingCancelNotices, async (order) => {
      if ((await sendTimeoutCancelNotice(order._id)) === "sent") counters.noticesRetried += 1;
    });

    const pendingAlerts = await Order.find({ paymentReviewNeeded: true, ...retryable("reviewAlert") })
      .select("_id")
      .limit(cfg.batchSize);

    await eachSafely(pendingAlerts, async (order) => {
      if ((await sendPaymentReviewAlert(order._id)) === "sent") counters.noticesRetried += 1;
    });

    const staleReviews = await Order.find({
      paymentReviewNeeded: true,
      "paymentNotices.reviewAlert.sentAt": { $lte: new Date(Date.now() - 24 * 60 * MINUTE) },
      ...retryable("reviewFollowUp"),
    })
      .select("_id")
      .limit(cfg.batchSize);

    await eachSafely(staleReviews, async (order) => {
      if ((await sendPaymentReviewAlert(order._id, { followUp: true })) === "sent") counters.noticesRetried += 1;
    });

    res.status(200).json({
      success: true,
      message: `Cancelled ${counters.cancelled} stale Razorpay order${counters.cancelled === 1 ? "" : "s"}, recovered ${counters.recovered} that had actually been paid`,
      ...counters,
    });
  } catch (error) {
    console.error("Pending Razorpay Orders Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Resolve a Payment Review (Admin)
// ============================
// The admin has checked the Razorpay dashboard (captured, refunded or let
// an authorization lapse there — this system never does either) and
// records what they found.
export const resolvePaymentReview = async (req, res) => {
  try {
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

    if (!note || note.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Please add a short note (up to 500 characters) on what you checked.",
      });
    }

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, paymentReviewNeeded: true },
      {
        $set: {
          paymentReviewNeeded: false,
          paymentReviewResolvedAt: new Date(),
          paymentReviewResolvedBy: String(req.user._id),
          paymentReviewNote: note,
        },
      },
      { new: true },
    ).populate("user", "name email mobile");

    if (!order) {
      return res.status(400).json({
        success: false,
        message: "This order has no open payment review.",
      });
    }

    res.status(200).json({ success: true, message: "Marked as reviewed", order });
  } catch (error) {
    console.error("Resolve Payment Review Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Resend Order Status Notification (Admin)
// ============================
// For cases where a customer says they never got the original status
// email (spam filter, typo'd address, etc.) — re-sends the notification
// for the order's current status without touching orderStatus,
// statusHistory, stock, or loyalty points at all.
export const resendOrderStatusEmail = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!ORDER_STATUS_MESSAGES[order.orderStatus]) {
      return res.status(400).json({
        success: false,
        message: `No notification email exists for status "${order.orderStatus}".`,
      });
    }

    sendOrderStatusNotification(order, order.orderStatus);

    res.status(200).json({
      success: true,
      message: "Notification resent",
    });
  } catch (error) {
    console.error("Resend Order Status Email Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Convert Cancelled Razorpay Order to COD (Admin)
// ============================
// A customer whose online payment failed/was abandoned (the stale-order
// cron then cancelled it and restored its stock) sometimes calls to say
// "send it Cash on Delivery instead". Re-placing the order by hand loses
// the original order ID and history, so this revives the same order as
// COD: re-reserves its stock, moves it back to Pending, and records when
// it was converted. Only unpaid orders qualify — and Razorpay itself is
// asked first, so an order whose payment actually went through (just
// never verified on our side) is never turned into a second, COD charge.
// Orders that redeemed loyalty points or claimed the first-order coupon
// are refused: the cancellation already handed those back, and
// re-claiming them here would duplicate createOrder's atomic claims.
export const convertOrderToCod = async (req, res) => {
  try {
    const addCodCharge = req.body?.addCodCharge === true;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.isActive) {
      return res.status(400).json({
        success: false,
        message: "This order is deleted — restore it before converting it",
      });
    }

    if (
      order.orderStatus !== "Cancelled" ||
      order.paymentMethod !== "Razorpay" ||
      order.isPaid ||
      order.paidAfterCancellation ||
      order.refundedAmount > 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Only a cancelled, unpaid Razorpay order can be converted to COD.",
      });
    }

    if (order.pointsRedeemed > 0 || order.firstOrderCouponApplied) {
      return res.status(400).json({
        success: false,
        message:
          "This order used loyalty points or the first-order coupon (already refunded on cancel) — please place a fresh COD order instead.",
      });
    }

    // Ask Razorpay first. Refused not only when money was taken
    // (captured / authorized) but also while a payment attempt is still in
    // flight (a UPI collect request can complete minutes later) or the
    // answer is unclear — any of those could charge the customer online
    // on top of the cash they'd then pay on delivery.
    const check = await reconcileRazorpayOrder(order, getPendingPaymentConfig());

    if (PAYMENT_TAKEN_VERDICTS.includes(check.verdict)) {
      return res.status(400).json({
        success: false,
        message:
          "Razorpay shows a payment on this order — check the Razorpay dashboard (refund or fulfil) instead of converting to COD.",
      });
    }

    if (check.verdict === "IN_FLIGHT") {
      return res.status(400).json({
        success: false,
        message:
          "A Razorpay payment attempt on this order is still in progress — try again in about half an hour.",
      });
    }

    if (check.verdict === "INCONCLUSIVE") {
      console.error(`Convert To COD Razorpay Check Error (order ${order._id}):`, check.error);

      return res.status(502).json({
        success: false,
        message: "Couldn't confirm the payment status with Razorpay — try again in a minute.",
      });
    }

    const setFields = {
      paymentMethod: "COD",
      orderStatus: "Pending",
      convertedToCodAt: new Date(),
      // Picked up straight away by the late-payment recheck.
      nextPaymentCheckAt: null,
    };

    if (addCodCharge && !(order.codCharge > 0)) {
      const settings = await SiteSettings.findOne().select("codCharge").lean();
      const codCharge = settings?.codCharge ?? 50;

      setFields.codCharge = codCharge;
      setFields.totalPrice = order.totalPrice + codCharge;
    }

    // Stock (the cancellation put it back on the shelf, and it may have
    // sold since) and the status claim commit together: a crash between
    // the two can no longer leave stock reserved for a still-Cancelled
    // order. Losing the claim to a concurrent request (double-click,
    // second tab, a payment landing) rolls the reservation back.
    const CLAIM_LOST = "convert-claim-lost";
    let outcome;

    try {
      outcome = await withOptionalTransaction(async (session) => {
        const stockResult = await reserveStock(order.orderItems, { session });

        if (!stockResult.success) return { stockResult };

        const claim = await Order.findOneAndUpdate(
          {
            _id: order._id,
            orderStatus: "Cancelled",
            paymentMethod: "Razorpay",
            isPaid: { $ne: true },
          },
          {
            $set: setFields,
            $push: { statusHistory: { status: "Pending", changedAt: new Date() } },
          },
          { new: true, session },
        );

        if (!claim) {
          if (!session) await restoreStock(order.orderItems);
          throw new Error(CLAIM_LOST);
        }

        return { claimed: claim };
      });
    } catch (error) {
      if (error instanceof TransactionsUnavailableError) {
        return res.status(503).json({
          success: false,
          message: "Converting orders is temporarily unavailable — nothing was changed, please try again shortly.",
        });
      }

      if (error.message !== CLAIM_LOST) throw error;

      return res.status(409).json({
        success: false,
        message: "This order was just changed elsewhere — refresh and try again.",
      });
    }

    if (outcome.stockResult) {
      return res.status(400).json({
        success: false,
        message: `Sorry, "${outcome.stockResult.failedItemName}" doesn't have enough stock available.`,
      });
    }

    const { claimed } = outcome;

    await postSafely(syncOrder, claimed._id);

    notifyUser({
      userId: claimed.user,
      type: "order_status",
      title: "Your order is confirmed as Cash on Delivery",
      message: `Order ID: ${claimed._id} — pay ₹${claimed.totalPrice} on delivery.`,
      link: `/my-orders/${claimed._id}`,
    });

    res.status(200).json({
      success: true,
      message: "Order converted to Cash on Delivery",
      order: claimed,
    });
  } catch (error) {
    console.error("Convert Order To COD Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
