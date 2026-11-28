import mongoose from "mongoose";

export const RETURN_STATUSES = ["Requested", "Approved", "Rejected", "Picked Up", "Refunded"];
// Still in progress; Rejected and Refunded are closed.
export const OPEN_RETURN_STATUSES = ["Requested", "Approved", "Picked Up"];
// The customer's reason is stored and emailed to the admin (OR-06).
export const RETURN_REASON_MAX_LENGTH = 1000;

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
      maxlength: RETURN_REASON_MAX_LENGTH,
    },

    status: {
      type: String,
      enum: RETURN_STATUSES,
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

    // When the refund happened / when the item was back in stock. The
    // accounting vouchers are dated from these (updatedAt moves on every
    // later touch -- an admin note, the "seen" flag).
    refundedAt: { type: Date, default: null },
    stockRestoredAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ status: 1, createdAt: -1 });
// One OPEN return request per product+size-in-order at a time — enforced
// at the DB level rather than only via the application-level
// check-then-create in createReturnRequest, which two concurrent
// submissions (double-click, two tabs) could both pass before either
// write lands. Closed returns (Rejected, Refunded) are left out, so the
// rest of a line can still be returned later (admin audit RC-02).
//
// Listed as $in, not { $ne: "Rejected" }: MongoDB cannot build a partial
// index on $ne, and that earlier version was silently never created
// (admin audit RC-01).
returnRequestSchema.index(
  { order: 1, product: 1, size: 1 },
  { unique: true, partialFilterExpression: { status: { $in: OPEN_RETURN_STATUSES } } },
);
// Admin notification poll's unseen-returns query.
returnRequestSchema.index({ isSeenByAdmin: 1, createdAt: -1 });

const ReturnRequest = mongoose.model("ReturnRequest", returnRequestSchema);

// Mongoose only emits a failed index build as an event; without a listener
// it is lost and the guard above silently doesn't exist (RC-01).
ReturnRequest.on("index", (error) => {
  if (error) {
    console.error(
      `[indexes] ReturnRequest index build FAILED (${error.codeName || error.code || "error"}): ${error.message}`,
    );
  }
});

export default ReturnRequest;
