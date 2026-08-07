import mongoose from "mongoose";

const returnRequestSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // Snapshot at request time, in case the product changes/is deleted later.
    productName: {
      type: String,
      required: true,
    },
    productImage: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
    },

    status: {
      type: String,
      enum: ["Requested", "Approved", "Rejected", "Picked Up", "Refunded"],
      default: "Requested",
    },

    adminNote: {
      type: String,
      default: "",
      trim: true,
    },

    isSeenByAdmin: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ status: 1, createdAt: -1 });
// One active return request per product-in-order at a time.
returnRequestSchema.index({ order: 1, product: 1 });

const ReturnRequest = mongoose.model("ReturnRequest", returnRequestSchema);

export default ReturnRequest;
