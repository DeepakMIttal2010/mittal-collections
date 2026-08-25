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

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
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
    reviewPointsAwarded: {
      type: Boolean,
      default: false,
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
