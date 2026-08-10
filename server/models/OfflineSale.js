import mongoose from "mongoose";

// A single line-item sale recorded via the in-shop QR/POS flow — kept
// separate from Order since it has none of the shipping/delivery/
// payment-gateway workflow an online order does; it's an instant
// in-person handover.
const offlineSaleSchema = new mongoose.Schema(
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

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
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
  },
  {
    timestamps: true,
  },
);

offlineSaleSchema.index({ createdAt: -1 });
offlineSaleSchema.index({ product: 1 });

const OfflineSale = mongoose.model("OfflineSale", offlineSaleSchema);

export default OfflineSale;
