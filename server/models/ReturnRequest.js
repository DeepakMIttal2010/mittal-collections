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

    // Which variant (size) this was, for a sized product — empty for a
    // non-variant product. Needed so restoreStock puts stock back on
    // the SAME variant it was taken from, not just the top-level
    // aggregate (see Product.js: top-level stock is always meant to
    // equal the sum of variants[].stock).
    size: {
      type: String,
      default: "",
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

    // Guards against re-applying these side effects if the status is
    // moved back and forth (e.g. Refunded set twice by mistake).
    stockRestored: {
      type: Boolean,
      default: false,
    },
    pointsClawedBack: {
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
// One active return request per product+size-in-order at a time —
// enforced at the DB level (partial: excludes Rejected, so a genuine
// re-request after rejection is still allowed) rather than only via the
// application-level findOne-then-create check in createReturnRequest,
// which two concurrent submissions (double-click, two tabs) could both
// pass before either write lands.
returnRequestSchema.index(
  { order: 1, product: 1, size: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "Rejected" } } },
);
// Admin notification poll's unseen-returns query.
returnRequestSchema.index({ isSeenByAdmin: 1, createdAt: -1 });

const ReturnRequest = mongoose.model("ReturnRequest", returnRequestSchema);

export default ReturnRequest;
