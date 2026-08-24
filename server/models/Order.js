import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

    deliveryFee: {
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

    pointsDiscount: {
      type: Number,
      default: 0,
    },

    pointsEarned: {
      type: Number,
      default: 0,
    },

    pointsCredited: {
      type: Boolean,
      default: false,
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

const Order = mongoose.model("Order", orderSchema);

export default Order;
