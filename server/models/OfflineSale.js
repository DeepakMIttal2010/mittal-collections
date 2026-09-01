import mongoose from "mongoose";

// One in-shop sale recorded via the QR/POS flow — can hold multiple
// products (a customer scanning several items into one cart), kept
// separate from Order since none of the shipping/delivery/payment-
// gateway workflow an online order has applies to an instant
// in-person handover.
const offlineSaleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // Snapshot at sale time, so the record stays accurate even if the
    // product is later renamed, repriced, or deleted.
    productName: {
      type: String,
      required: true,
    },

    // Which size variant was sold, if the product has variants — see
    // Product.js's variants field. Empty string for a non-variant product,
    // same convention Order.orderItems uses.
    size: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const offlineSaleSchema = new mongoose.Schema(
  {
    items: {
      type: [offlineSaleItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "A sale must have at least one item",
      },
    },

    // Subtotal before any discount — kept alongside totalAmount so the
    // discount actually applied is always recoverable from the record.
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Optional photo of the payment (UPI screenshot, card slip, etc.) as
    // proof of the transaction — Cloudinary URL, same as product images.
    paymentProofImage: {
      type: String,
      default: "",
    },

    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI", "Card"],
      required: true,
    },

    customerMobile: {
      type: String,
      default: "",
      trim: true,
    },

    customerName: {
      type: String,
      default: "",
      trim: true,
    },

    // Set only if customerMobile matched a registered account — used
    // to award loyalty points the same way an online order does.
    customerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    loyaltyPointsAwarded: {
      type: Number,
      default: 0,
    },

    soldBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Snapshot of the admin's own mobile at sale time — identifies
    // which staff member/device processed the sale even if that
    // admin's account details change later.
    soldByMobile: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

offlineSaleSchema.index({ createdAt: -1 });
offlineSaleSchema.index({ "items.product": 1 });

const OfflineSale = mongoose.model("OfflineSale", offlineSaleSchema);

export default OfflineSale;
