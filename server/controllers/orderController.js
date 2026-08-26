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
import {
  calculateDiscount,
  isEligibleForFirstOrderCoupon,
} from "./couponController.js";
import {
  getLoyaltySettings,
  pointsEarnedFor,
  maxRedeemablePoints,
  applyLoyaltyPointsChange,
} from "../utils/loyaltyPoints.js";
import { getReferralSettings } from "../utils/referral.js";
import { calculateDeliveryFee } from "../utils/shipping.js";
import { calculateBundleDiscount } from "../utils/bundleDiscount.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "../utils/notify.js";
import { REVIEW_BONUS_POINTS } from "./reviewController.js";

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

const ORDER_STATUS_MESSAGES = {
  Processing: {
    subject: "Your order is being processed",
    body: "Your order is now being processed and will be shipped soon.",
  },
  Shipped: {
    subject: "Your order has shipped",
    body: "Your order is on its way!",
  },
  Delivered: {
    subject: "Your order has been delivered",
    body: "Your order has been delivered. We hope you love it!",
  },
  Cancelled: {
    subject: "Your order has been cancelled",
    body: "Your order has been cancelled. If a coupon or loyalty points were used, they've been refunded to your account.",
  },
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
  const products = await Product.find({ _id: { $in: productIds } });
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
const reserveStock = async (orderItems) => {
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
          { new: true, arrayFilters: [{ "v.size": item.size }] },
        )
      : await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true },
        );

    if (!updated) {
      for (const r of reserved) {
        await restoreStock([r]);
      }

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

export const restoreStock = async (orderItems) => {
  for (const item of orderItems) {
    const product = item.size
      ? await Product.findOneAndUpdate(
          { _id: item.product, "variants.size": item.size },
          { $inc: { stock: item.quantity, "variants.$[v].stock": item.quantity } },
          { new: true, arrayFilters: [{ "v.size": item.size }] },
        )
      : await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: item.quantity } },
          { new: true },
        );

    const wasOutOfStock = product && product.stock - item.quantity <= 0;

    if (product && wasOutOfStock && product.stock > 0) {
      notifyStockAlertSubscribers(product).catch((error) =>
        console.error("Notify Stock Alert Subscribers Error:", error),
      );
    }
  }
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
    } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No order items",
      });
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

    const subtotal = verifiedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const settings = (await SiteSettings.findOne()) || {};
    const deliveryFee = calculateDeliveryFee(subtotal, settings);
    // Pass-through COD handling fee — never applied to Razorpay orders.
    const codCharge =
      paymentMethod === "COD" ? (settings.codCharge ?? 50) : 0;

    let discountAmount = 0;
    let appliedCouponCode = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.trim().toUpperCase(),
        isActive: true,
      });

      if (coupon) {
        const eligible = coupon.firstOrderOnly
          ? await isEligibleForFirstOrderCoupon(req.user._id)
          : true;

        if (eligible) {
          discountAmount = calculateDiscount(coupon, subtotal);
          appliedCouponCode = coupon.code;
        }
      }
    }

    const bundleResult = await calculateBundleDiscount(verifiedItems);
    const bundleDiscountAmount = bundleResult.discountAmount;

    // Loyalty points redemption — capped to what the user actually holds
    // and to half the subtotal, so points can never fully zero an order.
    let pointsRedeemed = 0;
    let pointsDiscount = 0;
    const loyaltySettings = await getLoyaltySettings();

    if (redeemPoints && Number(redeemPoints) > 0) {
      const requestedPoints = Math.floor(Number(redeemPoints));
      const currentUser = await User.findById(req.user._id).select(
        "loyaltyPoints",
      );
      const allowed = maxRedeemablePoints(
        subtotal,
        currentUser?.loyaltyPoints || 0,
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
        statusHistory: [{ status: "Pending", changedAt: new Date() }],
      });
    } catch (orderError) {
      await restoreStock(verifiedItems);
      throw orderError;
    }

    if (pointsRedeemed > 0) {
      await applyLoyaltyPointsChange({
        userId: req.user._id,
        type: "redeemed",
        points: -pointsRedeemed,
        order: order._id,
        description: `Redeemed on order ${order._id}`,
      });
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

        return res.status(500).json({
          success: false,
          message: "Unable to initiate payment. Please try again.",
        });
      }
    }

    // "Order placed" confirmation — distinct from the status-change emails
    // updateOrderStatus sends later (Processing/Shipped/Delivered/
    // Cancelled). Fires for every payment method, including a Razorpay
    // order not yet paid — this confirms the order was received, not that
    // payment succeeded. Never blocks the actual order response on failure.
    try {
      await sendEmail({
        to: req.user.email,
        bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: "Your Mittal Collections order is confirmed",
        html: `
          <p>Hi ${req.user.name || "there"},</p>
          <p>Thanks for your order! Here's a quick summary:</p>
          <p>Order ID: ${order._id}</p>
          <ul>
            ${verifiedItems
              .map(
                (item) =>
                  `<li>${item.name}${item.size ? ` (Size: ${item.size})` : ""} × ${item.quantity} — ₹${item.price * item.quantity}</li>`,
              )
              .join("")}
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

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    order.isPaid = true;
    order.paidAt = new Date();
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
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

    const orders = await Order.find()
      .populate("user", "name email mobile")
      .sort({ createdAt: sortOrder });

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

    // Security check: sirf order ka owner ya admin hi ise dekh sake
    const isOwner = order.user._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

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
        message: "This order is deleted — restore it before changing its status",
      });
    }

    if (!isValidStatusTransition(order.orderStatus, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from "${order.orderStatus}" to "${status}".`,
      });
    }

    const wasAlreadyCancelled = order.orderStatus === "Cancelled";
    const wasAlreadyCredited = order.pointsCredited;

    order.orderStatus = status;
    order.statusHistory.push({ status, changedAt: new Date() });

    if (status === "Delivered") {
      order.deliveredAt = Date.now();
    }

    if (status === "Delivered" && !wasAlreadyCredited) {
      const loyaltySettings = await getLoyaltySettings();
      order.pointsEarned = pointsEarnedFor(
        order.totalPrice,
        loyaltySettings.earnRate,
      );
      order.pointsCredited = true;
    }

    await order.save();

    if (status === "Cancelled" && !wasAlreadyCancelled) {
      await restoreStock(order.orderItems);

      // Give back any points spent on this order...
      if (order.pointsRedeemed > 0) {
        await applyLoyaltyPointsChange({
          userId: order.user,
          type: "refunded",
          points: order.pointsRedeemed,
          order: order._id,
          description: `Refund for cancelled order ${order._id}`,
        });
      }

      // ...and claw back any points already earned from it (covers a
      // delivered order later being marked cancelled, e.g. a return).
      if (wasAlreadyCredited && order.pointsEarned > 0) {
        await applyLoyaltyPointsChange({
          userId: order.user,
          type: "clawback",
          points: -order.pointsEarned,
          order: order._id,
          description: `Reversed earn from cancelled order ${order._id}`,
        });
      }
    } else if (status === "Delivered" && !wasAlreadyCredited) {
      if (order.pointsEarned > 0) {
        await applyLoyaltyPointsChange({
          userId: order.user,
          type: "earned",
          points: order.pointsEarned,
          order: order._id,
          description: `Earned on order ${order._id}`,
        });
      }

      // First delivered order for a referred customer pays out the
      // referral bonus to both sides, once only.
      const referredUser = await User.findById(order.user);

      if (referredUser?.referredBy && !referredUser.referralRewarded) {
        const referralSettings = await getReferralSettings();

        await applyLoyaltyPointsChange({
          userId: referredUser.referredBy,
          type: "referral_bonus",
          points: referralSettings.referrerPoints,
          order: order._id,
          description: `Referral bonus for inviting ${referredUser.name}`,
        });

        await applyLoyaltyPointsChange({
          userId: referredUser._id,
          type: "referral_bonus",
          points: referralSettings.referredPoints,
          order: order._id,
          description: "Referral signup bonus",
        });

        referredUser.referralRewarded = true;
        await referredUser.save();
      }
    }

    const statusMessage = ORDER_STATUS_MESSAGES[status];

    if (statusMessage) {
      notifyUser({
        userId: order.user,
        type: "order_status",
        title: statusMessage.subject,
        message: `Order ID: ${order._id}`,
        link: `/my-orders/${order._id}`,
      });

      User.findById(order.user)
        .select("name email")
        .then((customer) => {
          if (!customer?.email) return;

          return sendEmail({
            to: customer.email,
            bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
            subject: statusMessage.subject,
            html: `
              <p>Hi ${customer.name || "there"},</p>
              <p>${statusMessage.body}</p>
              <p>Order ID: ${order._id}</p>
              <p><a href="${process.env.CLIENT_URL}/my-orders/${order._id}">View your order</a></p>
            `,
          });
        })
        .catch((error) =>
          console.error("Order Status Email Error:", error),
        );
    }

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
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

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

      const itemsHtml = order.orderItems
        .map((item) => {
          const product = item.product;
          const isPopulated = product && typeof product === "object";
          const productId = isPopulated ? product._id : product;

          if (!productId) return `<li>${item.name}</li>`;

          // #reviews scrolls straight to (and auto-opens) the review form
          // — see ProductReviews.jsx — instead of leaving the customer to
          // find it themselves on a page they otherwise land on at the top.
          const url = `${process.env.CLIENT_URL}/product/${productId}${
            isPopulated && product.slug ? `/${product.slug}` : ""
          }#reviews`;

          return `<li>${item.name} — <a href="${url}">Leave a review</a></li>`;
        })
        .join("");

      try {
        await sendEmail({
          to: order.user.email,
          bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
          subject: "How was your order? Leave a review",
          html: `
            <p>Hi ${order.user.name || "there"},</p>
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

        order.reviewRequestSent = true;
        await order.save();
        sent += 1;
      } catch (error) {
        console.error(`Review request email failed for ${order.user.email}:`, error);
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
