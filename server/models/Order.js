import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // A UUID Checkout.jsx generates once per checkout attempt and
    // resends unchanged on any retry of that same submission (a flaky
    // network auto-retry, or the same click landing twice) — the
    // partial unique index below (scoped per user, only when this is
    // actually set) is what stops that from creating two real orders
    // for one checkout action. Every other race in createOrder
    // (stock, loyalty points, first-order coupon) is already claimed
    // atomically per-item/per-resource, but nothing previously stopped
    // two fully-valid, independently-successful requests from both
    // reaching Order.create() for the same checkout.
    clientRequestId: {
      type: String,
      default: null,
    },

    orderItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        name: String,

        image: String,

        price: Number,

        quantity: Number,

        // Which size variant was purchased, if the product has any (see
        // Product.js's variants field) — empty for a non-variant product.
        size: {
          type: String,
          default: "",
        },
      },
    ],

    shippingAddress: {
      fullName: {
        type: String,
        required: true,
      },

      mobile: {
        type: String,
        required: true,
      },

      address: {
        type: String,
        required: true,
      },

      city: {
        type: String,
        required: true,
      },

      state: {
        type: String,
        required: true,
      },

      pincode: {
        type: String,
        required: true,
      },
    },

    paymentMethod: {
      type: String,
      enum: ["COD", "Razorpay"],
      default: "COD",
    },

    totalPrice: {
      type: Number,
      required: true,
    },

    // Running total of item-level returns refunded against this order
    // (see returnController.js's updateReturnStatus, "Refunded" branch)
    // -- a partial return never changes orderStatus/totalPrice (only a
    // full-order cancellation does, via updateOrderStatus's Cancelled
    // branch), so every revenue aggregation that only excludes
    // Cancelled orders previously kept counting an order's ENTIRE
    // totalPrice even after some of its items were refunded, overstating
    // revenue by exactly the refunded amount, permanently (deep bug
    // sweep, 2026-10-19). Revenue aggregations now subtract this.
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    deliveryFee: {
      type: Number,
      default: 0,
    },

    // Only set when paymentMethod is "COD" — see SiteSettings.codCharge.
    codCharge: {
      type: Number,
      default: 0,
    },

    couponCode: {
      type: String,
      default: null,
    },

    discountAmount: {
      type: Number,
      default: 0,
    },

    bundleDiscountAmount: {
      type: Number,
      default: 0,
    },

    // Snapshotted at order time rather than re-derived from today's
    // bundleRules — an admin editing the rule later shouldn't rewrite
    // history for what a past order actually got discounted for.
    bundleDiscountPercent: {
      type: Number,
      default: 0,
    },

    bundleDiscountCategories: {
      type: [String],
      default: [],
    },

    pointsRedeemed: {
      type: Number,
      default: 0,
    },

    // Whether this order claimed the user's one-time
    // User.firstOrderCouponUsed flag (see orderController.js's
    // createOrder). Recorded on the order itself, not just re-derived
    // by looking the coupon back up, so every cancellation path can
    // release the flag reliably even if the Coupon doc is later
    // edited or deleted.
    firstOrderCouponApplied: {
      type: Boolean,
      default: false,
    },

    pointsDiscount: {
      type: Number,
      default: 0,
    },

    pointsEarned: {
      type: Number,
      default: 0,
    },

    // Running total of review-bonus points already awarded against this
    // order's shared cap (see ORDER_REVIEW_BONUS_CAP in reviewController).
    // Updated via an atomic increment so concurrent review approvals on
    // the same order can't both read a stale "0 awarded so far".
    reviewBonusAwarded: {
      type: Number,
      default: 0,
    },

    // True once this order's earn has been settled into the customer's
    // balance. Since the batch-based scheme, that happens only after the
    // return window closes (pointsAvailableAt) with no return still open
    // — until then pointsEarned is pending and can't be redeemed. Orders
    // delivered before the scheme were credited on delivery.
    pointsCredited: {
      type: Boolean,
      default: false,
    },

    // Set on delivery: the merchandise value the earn was worked out from
    // (items after coupon, bundle and points discounts — never delivery or
    // COD charges), and when the pending points become available.
    loyaltyEarnBase: Number,
    pointsAvailableAt: Date,
    pointsCreditedAt: Date,

    // Running total of pointsEarned taken back by returns/cancellation —
    // from the pending amount before credit, from the balance after.
    pointsClawedBack: {
      type: Number,
      default: 0,
    },

    // Recorded only on the specific order whose Delivered transition
    // actually triggered the one-time referral payout (User.referralRewarded
    // is a per-user flag, not per-order) — exactly the amounts paid to
    // each side at that moment, not re-derived from current
    // ReferralSettings later (those can change), so a later clawback (this
    // same order getting cancelled/returned) reverses precisely what was
    // given, no more and no less.
    referralBonusPaid: {
      type: Boolean,
      default: false,
    },
    referralBonusPoints: {
      referrer: { type: Number, default: 0 },
      referred: { type: Number, default: 0 },
    },

    orderStatus: {
      type: String,
      enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
      default: "Pending",
    },

    statusHistory: [
      {
        status: {
          type: String,
          enum: [
            "Pending",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled",
          ],
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    isPaid: {
      type: Boolean,
      default: false,
    },

    // Only set for paymentMethod: "Razorpay" orders — used to look the
    // order back up when verifying the payment signature.
    razorpayOrderId: {
      type: String,
      default: "",
    },

    razorpayPaymentId: {
      type: String,
      default: "",
    },

    // Set only in the narrow race where a Razorpay payment is verified
    // (valid signature — money genuinely taken) AFTER the stale-order
    // cron already cancelled this same order and restored its stock.
    // The order is left Cancelled rather than silently auto-revived
    // (stock may already be sold to someone else) — this flags it for
    // an admin to manually refund or manually re-fulfill.
    paidAfterCancellation: {
      type: Boolean,
      default: false,
    },

    isSeenByAdmin: {
      type: Boolean,
      default: false,
    },

    // Soft-delete flag, mirroring Product.isActive — an order can only be
    // deleted (and only permanently deleted) once its orderStatus is
    // "Cancelled" (enforced in orderController, not here), so this is a
    // separate concern from orderStatus itself.
    isActive: {
      type: Boolean,
      default: true,
    },

    paidAt: Date,

    deliveredAt: Date,

    // Set when an admin revived a cancelled, unpaid Razorpay order as COD
    // (see orderController.js's convertOrderToCod).
    convertedToCodAt: Date,

    // Why and when an order was cancelled. Orders cancelled before these
    // fields existed simply don't have them.
    cancelledAt: Date,
    cancellationReason: {
      type: String,
      enum: ["payment_timeout", "admin", "payment_init_failed", "other"],
    },
    // "system" for the pending-payment cron, otherwise the admin's user id.
    cancelledBy: String,

    // Which path recorded the payment: "verify" (checkout signature),
    // "resume" (Pay Now self-heal), "cron" (Razorpay API reconciliation)
    // or "webhook".
    paymentSource: String,

    // Pending-payment cron bookkeeping (see processPendingRazorpayOrders):
    // when this order is next due a Razorpay check, and how many checks
    // in a row came back inconclusive (API error/timeout).
    nextPaymentCheckAt: Date,
    paymentCheckFailures: {
      type: Number,
      default: 0,
    },
    lastPaymentCheckError: String,

    // Set when the payment state needs a human: an authorized-but-not-
    // captured payment, repeated inconclusive Razorpay checks, an amount
    // mismatch, money taken after cancellation or after conversion to COD,
    // or a second payment on an already-paid order. Never auto-cancelled
    // while set on a Pending order.
    paymentReviewNeeded: {
      type: Boolean,
      default: false,
    },
    paymentReviewReason: {
      type: String,
      enum: [
        "authorized_uncaptured",
        "check_inconclusive",
        "amount_mismatch",
        "paid_after_cancellation",
        "paid_after_cod_conversion",
        "duplicate_payment",
      ],
    },
    paymentReviewFlaggedAt: Date,
    paymentReviewResolvedAt: Date,
    // "system" when a later conclusive Razorpay check settled it,
    // otherwise the admin's user id.
    paymentReviewResolvedBy: String,
    paymentReviewNote: String,

    // Payment ids Razorpay reported on top of razorpayPaymentId for an
    // order that was already paid (a possible double charge).
    extraPaymentIds: {
      type: [String],
      default: undefined,
    },

    // Captured Razorpay payments whose amount or currency didn't match this
    // order (reported by the Razorpay webhook). Kept as evidence for the
    // amount_mismatch review; such a payment never marks the order paid.
    mismatchedPayments: {
      type: [
        new mongoose.Schema(
          { paymentId: String, amount: Number, currency: String, receivedAt: Date },
          { _id: false },
        ),
      ],
      default: undefined,
    },

    // One entry per customer/admin message the pending-payment flow
    // sends. claimedAt is a lease (a crashed send is retried once it
    // expires), sentAt is set only after the send succeeded, attempts
    // caps retries.
    paymentNotices: {
      reminder1: { claimedAt: Date, sentAt: Date, attempts: Number },
      reminder2: { claimedAt: Date, sentAt: Date, attempts: Number },
      timeoutCancel: { claimedAt: Date, sentAt: Date, attempts: Number },
      reviewAlert: { claimedAt: Date, sentAt: Date, attempts: Number },
      reviewFollowUp: { claimedAt: Date, sentAt: Date, attempts: Number },
    },

    // Guards the review-request cron (see sendReviewRequestEmails) against
    // emailing the same order twice.
    reviewRequestSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// "My Orders" (user + newest-first) and the best-sellers aggregation
// (orderStatus filter, then group by orderItems.product) are the two
// hottest query patterns on this collection.
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ "orderItems.product": 1 });
// Admin order list (no user filter) and the admin notification poll's
// unseen-orders query both sort by createdAt without a user filter.
orderSchema.index({ createdAt: -1 });
orderSchema.index({ isSeenByAdmin: 1, createdAt: -1 });
// Both cron jobs' filter shapes — neither matched an existing index
// (Mongo could use at most one field via the single-field indexes above
// and had to scan/filter the rest in memory). Currently cheap at today's
// order volume but these run on a recurring schedule, so the cost would
// otherwise creep up unnoticed as volume grows.
orderSchema.index({ orderStatus: 1, reviewRequestSent: 1 });
orderSchema.index({ paymentMethod: 1, orderStatus: 1, isPaid: 1 });
// Pending-payment cron: due unpaid orders oldest-first, the post-cancel /
// post-conversion late-payment recheck, and the review-alert sweep.
orderSchema.index({ paymentMethod: 1, orderStatus: 1, isPaid: 1, createdAt: 1 });
orderSchema.index({ cancellationReason: 1, cancelledAt: 1 });
orderSchema.index({ convertedToCodAt: 1 });
orderSchema.index({ paymentReviewNeeded: 1 });
// The Razorpay webhook only knows Razorpay's order id.
orderSchema.index({ razorpayOrderId: 1 });
// Loyalty job: delivered orders whose pending points are due.
orderSchema.index({ orderStatus: 1, pointsCredited: 1, pointsAvailableAt: 1 });
orderSchema.index(
  { user: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } },
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
