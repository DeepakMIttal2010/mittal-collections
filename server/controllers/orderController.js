import Order from "../models/Order.js";
import Coupon from "../models/Coupon.js";
import SiteSettings from "../models/SiteSettings.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import CartSnapshot from "../models/CartSnapshot.js";
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
import { sendEmail } from "../config/mailer.js";

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

// Atomically reserve stock for every item. If any item doesn't have enough
// stock, roll back the items already reserved and return that item's name.
const reserveStock = async (orderItems) => {
  const reserved = [];

  for (const item of orderItems) {
    const updated = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true },
    );

    if (!updated) {
      for (const r of reserved) {
        await Product.findByIdAndUpdate(r.product, {
          $inc: { stock: r.quantity },
        });
      }

      return { success: false, failedItemName: item.name };
    }

    reserved.push({ product: item.product, quantity: item.quantity });
  }

  return { success: true };
};

const restoreStock = async (orderItems) => {
  for (const item of orderItems) {
    const product = await Product.findByIdAndUpdate(
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

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const settings = (await SiteSettings.findOne()) || {};
    const deliveryFee = calculateDeliveryFee(subtotal, settings);

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
      subtotal + deliveryFee - discountAmount - pointsDiscount,
      0,
    );

    const stockResult = await reserveStock(orderItems);

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
        orderItems,
        shippingAddress,
        paymentMethod,
        totalPrice,
        couponCode: appliedCouponCode,
        discountAmount,
        pointsRedeemed,
        pointsDiscount,
        statusHistory: [{ status: "Pending", changedAt: new Date() }],
      });
    } catch (orderError) {
      await restoreStock(orderItems);
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

    res.status(201).json({
      success: true,
      order,
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
// Get Logged In User Orders
// ============================

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user._id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      orders,
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
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email mobile",
    );

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
      order,
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
      User.findById(order.user)
        .select("name email")
        .then((customer) => {
          if (!customer?.email) return;

          return sendEmail({
            to: customer.email,
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
