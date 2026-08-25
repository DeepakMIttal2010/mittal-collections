import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The Delivered order (if any) that made this product reviewable —
    // set at submission time by looking up the reviewer's own order
    // history. Used only to group multiple reviews from the same order
    // for the per-order loyalty-bonus cap (see approveReview); null for
    // a review with no matching order on file (e.g. seeded/test data).
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    // No separate title field — just a rating and free-text review, kept
    // deliberately simple. (Optional rather than removed outright so
    // older reviews that do have one keep displaying correctly.)
    title: {
      type: String,
      default: "",
      trim: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    // Cloudinary URLs — optional, capped at 3 (enforced in the
    // controller, not just here, so a bad request fails before any
    // upload happens).
    images: {
      type: [String],
      default: [],
    },

    // Optional single short clip (~10-15s, enforced in the controller
    // via Cloudinary's reported duration after upload).
    video: {
      type: String,
      default: "",
    },

    isApproved: {
      type: Boolean,
      default: false,
    },

    isSeenByAdmin: {
      type: Boolean,
      default: false,
    },

    // Guards the review-bonus loyalty points (see approveReview) against
    // being credited twice if a review is approved more than once.
    reviewPointsProcessed: {
      type: Boolean,
      default: false,
    },

    // Exact points this specific review contributed — can be less than
    // the flat per-review bonus (or zero) once the order-level cap is
    // already used up by an earlier-approved review from the same order.
    pointsAwarded: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Admin notification poll's unseen-reviews query.
reviewSchema.index({ isSeenByAdmin: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
