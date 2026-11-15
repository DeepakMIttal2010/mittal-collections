import mongoose from "mongoose";
import Review, { REVIEW_CONTENT_MAX_LENGTH } from "../models/Review.js";
import { findDeliveredPurchase } from "../utils/reviewEligibility.js";
import cloudinary from "../config/cloudinary.js";
import {
  applyLoyaltyPointsChange,
  LoyaltyConflictError,
  reviewBonusReversalPlan,
} from "../utils/loyaltyPoints.js";
import {
  awardReviewBonus,
  applyReviewBonusReversal,
  ReversalRefusedError,
} from "../utils/reviewBonus.js";
import { withOptionalTransaction } from "../utils/orderTransactions.js";
import { notifyUser } from "../utils/notify.js";
import { deleteCloudinaryAssetsByUrl } from "../utils/cloudinaryCleanup.js";
import { buildAdminReviewFilter, sendFilterError } from "./reviewModerationController.js";
import { publicReviewFilter, publicPhotoReviewFilter, toPublicReview } from "../utils/publicReview.js";

// The bonus amount and the per-order cap live with the award/reversal
// logic in utils/reviewBonus.js; re-exported here for existing importers.
export { REVIEW_BONUS_POINTS, ORDER_REVIEW_BONUS_CAP } from "../utils/reviewBonus.js";

// Hard ceiling on review-video length — the UI asks for ~10-15s, this just
// guards against someone uploading something far longer.
const MAX_REVIEW_VIDEO_SECONDS = 20;

// ============================
// GET APPROVED REVIEWS FOR A PRODUCT (Public)
// ============================
export const getProductReviews = async (req, res) => {
  try {
    // Every other list endpoint in this area caps its result (
    // getProductQuestions at 500, getShowcaseReviews at 12,
    // getAllReviewsAdmin at 2000) -- this one didn't, so a single
    // heavily-reviewed product returned its entire approved-review set,
    // photo/video URLs included, on every page load (deep bug sweep,
    // 2026-10-19). 500 matches getProductQuestions' own per-product
    // public-list cap.
    const reviews = await Review.find(publicReviewFilter({ product: req.params.productId }))
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    // totalReviews/averageRating are the real aggregate stats shown as
    // the product's star-rating summary -- computed from the FULL
    // approved set via aggregation (same source of truth
    // productController.js's batched review-stats query already uses),
    // not from the capped `reviews` list above, so the cap above can
    // never understate them.
    const statsAgg = await Review.aggregate([
      {
        $match: publicReviewFilter({
          product: new mongoose.Types.ObjectId(req.params.productId),
        }),
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);
    const totalReviews = statsAgg[0]?.totalReviews || 0;
    const averageRating = statsAgg[0]?.averageRating || 0;

    res.status(200).json({
      success: true,
      // Allowlisted fields only — short name, no user/order ids, no
      // points or admin fields; media only with the reviewer's consent.
      reviews: reviews.map((review) => toPublicReview(review)),
      totalReviews,
      averageRating,
    });
  } catch (error) {
    console.error("Get Product Reviews Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Multipart form fields arrive as strings; only an explicit yes counts.
const isConsentGiven = (value) => value === true || (typeof value === "string" && ["true", "1", "on"].includes(value));

// Every reason to turn a submission away that doesn't need the uploaded
// media itself. Returns { reject: { status, body } } or { submission }.
const checkReviewSubmission = async (req) => {
  const { productId, rating, title, content } = req.body;

  // productId comes straight from the request body (unlike a route
  // param, which Express always parses as a plain string) — an object
  // payload like {"$gt": ""} here would otherwise flow into the
  // Review.findOne/Order.findOne queries below as a raw Mongo query
  // operator instead of a literal id. The explicit typeof check (not
  // just ObjectId.isValid, which also accepts 12-byte buffers) is
  // what closes off an object-shaped payload in a way static analysis
  // can actually verify.
  if (
    typeof productId !== "string" ||
    !mongoose.Types.ObjectId.isValid(productId) ||
    !rating ||
    typeof content !== "string" ||
    !content.trim()
  ) {
    return { reject: { status: 400, body: { success: false, message: "Product, rating and content are required" } } };
  }

  // Multipart bodies send the rating as a string. Only a single
  // string/number value is accepted (Number(["4"]) would otherwise
  // quietly read as 4), and it must be a whole star — 4.5 used to be
  // stored, and then fell outside the 5..1 star breakdown on the page.
  const ratingValue = Number(rating);

  if (
    !["string", "number"].includes(typeof rating) ||
    !Number.isInteger(ratingValue) ||
    ratingValue < 1 ||
    ratingValue > 5
  ) {
    return { reject: { status: 400, body: { success: false, message: "Rating must be a whole number from 1 to 5" } } };
  }

  if (content.trim().length > REVIEW_CONTENT_MAX_LENGTH) {
    return {
      reject: {
        status: 400,
        body: { success: false, message: `Review must be ${REVIEW_CONTENT_MAX_LENGTH} characters or fewer` },
      },
    };
  }

  // A real ObjectId instance (not just a validated string) for the
  // raw query-filter/document objects below — guarantees those object
  // literals can never carry an object-shaped value.
  const safeProductId = new mongoose.Types.ObjectId(productId);

  // Verified purchases only: the customer must have bought this product
  // and had it delivered. A later return or post-delivery cancellation
  // doesn't take that away (see reviewEligibility.js) — someone who sent
  // it back can still say why.
  const order = await findDeliveredPurchase(req.user._id, safeProductId);

  if (!order) {
    return {
      reject: {
        status: 403,
        body: {
          success: false,
          code: "NOT_ELIGIBLE",
          message: "You can review products you have bought and received.",
        },
      },
    };
  }

  const existing = await Review.exists({ product: safeProductId, user: req.user._id });

  if (existing) {
    return { reject: { status: 400, body: { success: false, message: "You have already reviewed this product" } } };
  }

  // Photos/video are shown publicly with the review, so they need the
  // reviewer's explicit consent (the unticked checkbox on the form).
  // Checked last (after eligibility, so a non-buyer still hears why they
  // can't review) but still before imageOptimizer, so media sent without it is
  // turned away while still only in memory, never uploaded.
  const photoConsent = isConsentGiven(req.body.photoConsent);
  const hasMedia = (req.files?.images?.length || 0) > 0 || (req.files?.video?.length || 0) > 0;

  if (hasMedia && !photoConsent) {
    return {
      reject: {
        status: 400,
        body: {
          success: false,
          code: "PHOTO_CONSENT_REQUIRED",
          message: "Please tick the box agreeing that your photos/video may be shown publicly with your review, or remove them.",
        },
      },
    };
  }

  return {
    submission: { productId: safeProductId, order, rating: ratingValue, title: title || "", content, photoConsent },
  };
};

// ============================
// VALIDATE A REVIEW BEFORE ITS MEDIA IS UPLOADED (Logged-in user)
// ============================
// Runs between uploadReviewMedia and imageOptimizer (see reviewRoutes.js).
// multer keeps files in memory only (memoryStorage) and it's imageOptimizer
// that sends them to Cloudinary — so turning a request away here means a
// customer who isn't allowed to review (or whose form is invalid) never
// gets a single photo or video stored, even by calling the API directly.
export const validateReviewSubmission = async (req, res, next) => {
  try {
    const { reject, submission } = await checkReviewSubmission(req);

    if (reject) return res.status(reject.status).json(reject.body);

    req.reviewSubmission = submission;
    next();
  } catch (error) {
    console.error("Validate Review Submission Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// SUBMIT REVIEW (Logged-in user)
// ============================
export const submitReview = async (req, res) => {
  // imageOptimizer runs before this controller, so by the time we get here
  // any images/video are already live Cloudinary assets — every
  // early-return/error path below must clean these up (same leak class
  // already fixed for bannerController.js's addBanner), or a
  // rejected/failed submission leaves orphaned uploads behind.
  const uploadedUrls = [
    ...(req.files?.images || []).map((file) => file.path),
    ...(req.files?.video ? [req.files.video[0].path] : []),
  ];

  try {
    // Normally already checked by validateReviewSubmission before any
    // upload; re-checked here only if this handler is ever mounted without
    // it, so the rules can't be skipped.
    let submission = req.reviewSubmission;

    if (!submission) {
      const checked = await checkReviewSubmission(req);

      if (checked.reject) {
        await deleteCloudinaryAssetsByUrl(uploadedUrls);
        return res.status(checked.reject.status).json(checked.reject.body);
      }

      submission = checked.submission;
    }

    const { productId: safeProductId, order, rating: ratingValue, title, content, photoConsent } = submission;

    const videoFile = req.files?.video?.[0];

    if (videoFile) {
      const duration = videoFile.cloudinaryResult?.duration;

      if (duration && duration > MAX_REVIEW_VIDEO_SECONDS) {
        await cloudinary.uploader.destroy(videoFile.cloudinaryResult.public_id, {
          resource_type: "video",
        });
        await deleteCloudinaryAssetsByUrl(
          (req.files?.images || []).map((file) => file.path),
        );

        return res.status(400).json({
          success: false,
          message: `Video must be ${MAX_REVIEW_VIDEO_SECONDS} seconds or shorter`,
        });
      }
    }

    const images = (req.files?.images || []).map((file) => file.path);

    const review = await Review.create({
      product: safeProductId,
      user: req.user._id,
      order: order._id,
      rating: ratingValue,
      title,
      content,
      images,
      video: videoFile?.path || "",
      photoConsent,
      photoConsentAt: photoConsent ? new Date() : null,
    });

    // Only what the submitter's own form needs — never the order/user
    // ids, points or moderation fields of the stored document.
    res.status(201).json({
      success: true,
      message: "Thanks! Your review will appear once approved by our team.",
      review: {
        _id: review._id,
        rating: review.rating,
        title: review.title,
        content: review.content,
        isApproved: review.isApproved,
        createdAt: review.createdAt,
        photoConsent: review.photoConsent,
      },
    });
  } catch (error) {
    // The unique {product, user} index (see Review.js) is what actually
    // stops two concurrent submissions from both creating a review — the
    // findOne check above can't fully close that race. Surface the
    // loser's duplicate-key error as the same message the check above
    // gives, not a generic 500.
    await deleteCloudinaryAssetsByUrl(uploadedUrls);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)[0]?.message || "Invalid review",
      });
    }

    console.error("Submit Review Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// CAN I REVIEW THIS PRODUCT? (Logged-in user)
// ============================
// Lets the product page show the review form only to customers whose
// submission would actually be accepted, instead of letting them write a
// review and attach photos only to be turned away. submitReview still
// makes the same check itself — this is a convenience, not the gate.
export const getReviewEligibility = async (req, res) => {
  try {
    const productId = new mongoose.Types.ObjectId(req.params.productId);

    const [order, existing] = await Promise.all([
      findDeliveredPurchase(req.user._id, productId),
      Review.exists({ product: productId, user: req.user._id }),
    ]);

    res.status(200).json({
      success: true,
      eligible: Boolean(order) && !existing,
      hasPurchased: Boolean(order),
      alreadyReviewed: Boolean(existing),
    });
  } catch (error) {
    console.error("Get Review Eligibility Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET REVIEWS WITH PHOTOS FOR THE HOMEPAGE GALLERY (Public)
// ============================
const SHOWCASE_LIMIT = 12;

export const getShowcaseReviews = async (req, res) => {
  try {
    // Only reviews whose photos the reviewer agreed to show publicly.
    const reviews = await Review.find(publicPhotoReviewFilter())
      .populate("user", "name")
      .populate("product", "name slug image")
      .sort({ createdAt: -1 })
      .limit(SHOWCASE_LIMIT)
      .lean();

    res.status(200).json({
      success: true,
      reviews: reviews.map((review) => toPublicReview(review, { includeProduct: true })),
    });
  } catch (error) {
    console.error("Get Showcase Reviews Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL REVIEWS (Admin)
// ============================
export const ADMIN_REVIEW_LIST_CAP = 2000;

export const getAllReviewsAdmin = async (req, res) => {
  try {
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    // status / visibility / rating / hasPhotos / rewarded / from / to —
    // each mapped to a fixed condition (see buildAdminReviewFilter); an
    // unknown value is a 400, never passed through to Mongo.
    let filter;
    try {
      filter = buildAdminReviewFilter(req.query);
    } catch (error) {
      if (sendFilterError(res, error)) return;
      throw error;
    }

    // Safety ceiling, not real pagination — see getAllOrders' own
    // comment (orderController.js) for why this pattern was chosen here
    // over a full pagination rework.
    const reviews = await Review.find(filter)
      .select("+bonusReversal +bonusHold")
      .populate("user", "name email")
      .populate("product", "name image")
      .sort({ createdAt: sortOrder })
      .limit(ADMIN_REVIEW_LIST_CAP);

    // When the cap is hit, say so (with the real count for the same
    // filter) so the admin page can tell the list is incomplete.
    const truncated = reviews.length >= ADMIN_REVIEW_LIST_CAP;
    const total = truncated ? await Review.countDocuments(filter) : reviews.length;

    res.status(200).json({
      success: true,
      reviews,
      total,
      truncated: truncated && total > reviews.length,
    });
  } catch (error) {
    console.error("Get All Reviews Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// APPROVE REVIEW (Admin)
// ============================
export const approveReview = async (req, res) => {
  try {
    // A hidden review can't be approved (owner decision): the admin must
    // unhide it first. The not-hidden condition is part of the same
    // atomic update, so a concurrent hide can't slip between a check and
    // the write — and a refused approval changes nothing and awards no
    // points.
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, isHidden: { $ne: true } },
      { isApproved: true },
      { new: true },
    );

    if (!review) {
      const exists = await Review.exists({ _id: req.params.id });

      if (exists) {
        return res.status(409).json({
          success: false,
          message: "This review is hidden. Unhide it before approving.",
        });
      }

      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Awarded on approval (not at submission) so a spam/low-effort review
    // never earns points — approval is already the moderation checkpoint
    // admins go through anyway, so this rides along with no extra step.
    //
    // The claim, the cap reservation, the points and pointsAwarded commit
    // together in one transaction (see awardReviewBonus), so approving
    // twice — or approving while an admin grants the bonus — pays once.
    // A review whose product is being returned (every unit), or whose
    // order was cancelled/deleted, is approved and shown but paid nothing
    // for now: the bonus is held, uses none of the order's cap, and can be
    // granted later if the return is rejected (grantReviewBonus). A review
    // already on hold is never paid by approving it again — only the grant
    // (reviews + loyalty permissions) releases a hold.
    const outcome = await withOptionalTransaction((session) =>
      awardReviewBonus({ reviewId: review._id, session }),
    );

    if (outcome.status === "awarded") review.pointsAwarded = outcome.points;
    const award = outcome.status === "awarded" ? outcome.points : 0;

    if (award > 0) {
      notifyBonusAwarded(review.user, award, "Your review was approved");
    }

    res.status(200).json({
      success: true,
      message: "Review approved",
      review,
      ...(outcome.status === "held" && { bonusHold: { reason: outcome.reason } }),
    });
  } catch (error) {
    console.error("Approve Review Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const notifyBonusAwarded = (userId, points, lead) =>
  notifyUser({
    userId,
    type: "loyalty_points",
    title: "You earned bonus loyalty points!",
    message: `${lead} — ${points} bonus points added to your account.`,
    link: "/loyalty-history",
  });

const HOLD_REASON_TEXT = {
  return_in_progress: "a return for this item is still open",
  returned: "the item was returned",
  order_cancelled: "the order was cancelled",
  order_deleted: "the order was deleted",
};

// ============================
// GRANT A HELD REVIEW BONUS (Admin)
// ============================
// For an approved review whose bonus was held at approval (its item was
// being returned) once that return has been rejected. Re-checks
// eligibility now, inside the transaction, and pays through the same path
// as approval — same cap, same ledger key — so it pays at most once.
export const grantReviewBonus = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id).select("isApproved reviewPointsProcessed");

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (!review.isApproved) {
      return res.status(400).json({ success: false, message: "Approve the review first" });
    }

    // The eligibility re-check runs inside the award transaction. Known
    // limitation (accepted): createReturnRequest doesn't write the order,
    // so a return created in the very same instant isn't seen here and the
    // bonus can still be paid — the automatic reversal when that return is
    // fully refunded takes it back (reverseReviewBonusIfFullyReturned).
    const outcome = await withOptionalTransaction((session) =>
      awardReviewBonus({ reviewId: review._id, releaseHold: true, session }),
    );

    if (outcome.status === "already") {
      return res.status(409).json({
        success: false,
        message: "This review's bonus has already been processed",
      });
    }

    if (outcome.status === "held") {
      return res.status(409).json({
        success: false,
        code: "BONUS_STILL_HELD",
        message: `No bonus can be paid yet — ${HOLD_REASON_TEXT[outcome.reason]}`,
        bonusHold: { reason: outcome.reason },
      });
    }

    if (outcome.points > 0) {
      notifyBonusAwarded(review.user, outcome.points, "Your review bonus was released");
    }

    res.status(200).json({
      success: true,
      message:
        outcome.points > 0
          ? `Bonus granted — ${outcome.points} points added`
          : "No bonus paid — this order's review bonus is already used",
      pointsAwarded: outcome.points,
    });
  } catch (error) {
    console.error("Grant Review Bonus Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// REVERSE A REVIEW'S BONUS (Admin)
// ============================
// For a review found to be fake/fraudulent after its bonus was paid. A
// separate, explicit action — approving, hiding or marking a review seen
// never touches points. The review itself is left as it is (the admin can
// still hide or delete it separately).
export const REVERSAL_REASON_MIN = 10;
export const REVERSAL_REASON_MAX = 1000;
export const REVERSAL_EVIDENCE_MAX = 2000;

export const reverseReviewBonus = async (req, res) => {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const evidence = typeof req.body?.evidence === "string" ? req.body.evidence.trim() : "";

    if (reason.length < REVERSAL_REASON_MIN || reason.length > REVERSAL_REASON_MAX) {
      return res.status(400).json({
        success: false,
        message: `A reason of ${REVERSAL_REASON_MIN}-${REVERSAL_REASON_MAX} characters is required`,
      });
    }

    if (evidence.length > REVERSAL_EVIDENCE_MAX) {
      return res.status(400).json({
        success: false,
        message: `Evidence notes must be ${REVERSAL_EVIDENCE_MAX} characters or fewer`,
      });
    }

    // Shared with the automatic reversals (item returned, order cancelled
    // or deleted) — see applyReviewBonusReversal in utils/reviewBonus.js.
    const reversal = await withOptionalTransaction((session) =>
      applyReviewBonusReversal({
        reviewId: req.params.id,
        reason,
        evidence,
        actor: { id: req.user._id, name: req.user.name || "" },
        session,
      }),
    );

    res.status(200).json({
      success: true,
      message: [
        `Bonus reversed — ${reversal.pointsDebited} points taken back`,
        reversal.shortfall > 0 ? `${reversal.shortfall} already spent and recorded as owed` : "",
        reversal.expiredPortion > 0 ? `${reversal.expiredPortion} had already expired` : "",
      ]
        .filter(Boolean)
        .join(", "),
      bonusReversal: reversal,
    });
  } catch (error) {
    if (error instanceof ReversalRefusedError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }

    if (error instanceof LoyaltyConflictError) {
      return res.status(409).json({
        success: false,
        message: "The customer's points changed during the reversal — please try again",
      });
    }

    console.error("Reverse Review Bonus Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// MARK REVIEW SEEN (Admin)
// ============================
export const markReviewSeen = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isSeenByAdmin: true },
      { new: true },
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    res.status(200).json({
      success: true,
      review,
    });
  } catch (error) {
    console.error("Mark Review Seen Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE / REJECT REVIEW (Admin)
// ============================
export const deleteReview = async (req, res) => {
  try {
    // Claw back any bonus already paid for this review (e.g. an admin
    // rejecting it as spam after approving it), so the user doesn't keep
    // the points. Its share of the order's cap stays used (owner
    // decision, 2026-11-15): a resubmitted review on the same order earns
    // nothing, the same as after any other reversal.
    // The delete and the reversal commit together; points already spent
    // are recorded as owed.
    const review = await withOptionalTransaction(async (session) => {
      const deleted = await Review.findByIdAndDelete(req.params.id, { session }).select(
        "+bonusReversal",
      );

      // A bonus already taken back by reverseReviewBonus isn't taken back
      // again. The order's cap is never released here.
      if (deleted?.pointsAwarded > 0 && !deleted.bonusReversal?.reversedAt) {
        // Same rule as reverseReviewBonus: an expired part isn't taken back.
        const plan = await reviewBonusReversalPlan({
          reviewId: deleted._id,
          points: deleted.pointsAwarded,
          session,
        });

        if (plan.debit > 0) {
          await applyLoyaltyPointsChange({
            userId: deleted.user,
            type: "clawback",
            source: "review",
            points: -plan.debit,
            key: `review-reversal:${deleted._id}`,
            order: deleted.order || null,
            review: deleted._id,
            description: "Reversed bonus for a deleted review",
            preferLotIds: plan.lotIds,
            allowShortfall: true,
            session,
          });
        }
      }

      return deleted;
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    await deleteCloudinaryAssetsByUrl([...review.images, review.video]);

    res.status(200).json({
      success: true,
      message: "Review deleted",
    });
  } catch (error) {
    console.error("Delete Review Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
