import mongoose from "mongoose";

// Shared with submitReview's own check (which answers with a clear message
// before the document is ever built) and mirrored in ProductReviews.jsx.
export const REVIEW_CONTENT_MAX_LENGTH = 2000;

// Moderation limits — also checked in reviewModerationController.js so a
// bad request gets a clear 400 before any write.
export const REVIEW_HIDDEN_REASON_MAX_LENGTH = 500;
export const REVIEW_REPLY_MAX_LENGTH = 1000;

const adminReplySchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [REVIEW_REPLY_MAX_LENGTH, `Reply must be ${REVIEW_REPLY_MAX_LENGTH} characters or fewer`],
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    repliedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

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

    // The delivered order that made this product reviewable — set at
    // submission time from the reviewer's own order history (see
    // findDeliveredPurchase), and required for every new review. Also
    // groups reviews from the same order for the per-order loyalty-bonus
    // cap (see approveReview). null only on older reviews submitted before
    // a delivered purchase was required.
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
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number from 1 to 5",
      },
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
      maxlength: [REVIEW_CONTENT_MAX_LENGTH, `Review must be ${REVIEW_CONTENT_MAX_LENGTH} characters or fewer`],
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

    // The reviewer ticked "my photos may be shown publicly with my
    // review" (required by submitReview whenever photos or a video are
    // attached). Public responses show media only when this is true —
    // older reviews from before the checkbox keep their media for the
    // admin but don't show it publicly (see utils/publicReview.js).
    photoConsent: {
      type: Boolean,
      default: false,
    },

    photoConsentAt: {
      type: Date,
      default: null,
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

    // Moderation (PR3a). A hidden review stays in the database — and keeps
    // any loyalty bonus it already earned; hiding never touches points —
    // but is left out of every public list, count and average (see
    // publicReviewFilter in utils/publicReview.js). Unhiding clears
    // all four fields.
    isHidden: {
      type: Boolean,
      default: false,
    },

    hiddenReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: [REVIEW_HIDDEN_REASON_MAX_LENGTH, `Reason must be ${REVIEW_HIDDEN_REASON_MAX_LENGTH} characters or fewer`],
    },

    hiddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    hiddenAt: {
      type: Date,
      default: null,
    },

    // The store's public reply, shown under the review as "Reply from
    // Mittal Collections". Plain text only — rendered as a text node,
    // never as HTML. repliedBy is admin-only and is stripped from every
    // public response (toPublicReview in utils/publicReview.js).
    adminReply: {
      type: adminReplySchema,
      default: null,
    },

    // Set once, when an admin takes back this review's bonus as fake or
    // fraudulent (see reverseReviewBonus). Its presence is the guard
    // against reversing twice. Admin-only: select: false keeps it out of
    // every query (and so every public response) that doesn't ask for it
    // with .select("+bonusReversal").
    bonusReversal: {
      type: new mongoose.Schema(
        {
          reversedAt: { type: Date, required: true },
          // null when the system reversed it (the item was returned, or
          // the order was cancelled/deleted — see reviewBonus.js).
          reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          reversedByName: { type: String, default: "" },
          reason: { type: String, required: true },
          evidence: { type: String, default: "" },
          // The bonus being reversed (= pointsAwarded at the time).
          points: { type: Number, required: true },
          // What actually came off the balance, and what couldn't because
          // it was already spent (recorded as owed on the user instead).
          pointsDebited: { type: Number, default: 0 },
          shortfall: { type: Number, default: 0 },
          // Part of the bonus whose batch had already expired — not taken
          // back and never owed (only the still-valid part is reversed).
          expiredPortion: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: undefined,
      select: false,
    },

    // Set when an approval paid no bonus only because, right now, every
    // unit of this product on the order is being returned (or was), or the
    // order was cancelled/deleted. Unlike a capped or order-less review,
    // a held one is NOT marked reviewPointsProcessed and uses none of the
    // order's cap — if the return is rejected, an admin can grant the
    // bonus later (POST /api/reviews/:id/grant-bonus), which re-checks and
    // clears this. Admin-only, like bonusReversal.
    bonusHold: {
      type: new mongoose.Schema(
        {
          reason: {
            type: String,
            // return_rejected: the item is kept again, so an admin can now
            // grant it (re-approving never pays a held bonus).
            enum: ["return_in_progress", "returned", "order_cancelled", "order_deleted", "return_rejected"],
            required: true,
          },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: undefined,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

// Admin notification poll's unseen-reviews query.
reviewSchema.index({ isSeenByAdmin: 1, createdAt: -1 });
// One review per customer per product — enforced at the DB level, not
// just the findOne-then-create check in submitReview, which two
// concurrent submissions (double-click, two tabs) could both pass
// before either write lands.
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
