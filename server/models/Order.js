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

const Order = mongoose.model("Order", orderSchema);

export default Order;
