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

    isSeenByAdmin: {
      type: Boolean,
      default: false,
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
