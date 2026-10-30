import mongoose from "mongoose";
import Review, { REVIEW_CONTENT_MAX_LENGTH } from "../models/Review.js";
import Order from "../models/Order.js";
import { findDeliveredPurchase } from "../utils/reviewEligibility.js";
import cloudinary from "../config/cloudinary.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import { applyLoyaltyPointsChange } from "../utils/loyaltyPoints.js";
import { withOptionalTransaction } from "../utils/orderTransactions.js";
import { notifyUser } from "../utils/notify.js";
import { deleteCloudinaryAssetsByUrl } from "../utils/cloudinaryCleanup.js";

// Flat bonus for a review the admin actually approves — deliberately not
// randomized/"win up to X" (that reads as a chance-based contest, which
// carries real regulatory risk in several Indian states); a guaranteed
// amount is simpler and carries none of that risk.
export const REVIEW_BONUS_POINTS = 50;

// One order can contain several products, and a customer can review each
// one — but the combined bonus across all reviews tied to the same order
// is capped here, not per review.
export const ORDER_REVIEW_BONUS_CAP = 50;

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
    const reviews = await Review.find({
      product: req.params.productId,
      isApproved: true,
    })
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .limit(500);

    // totalReviews/averageRating are the real aggregate stats shown as
    // the product's star-rating summary -- computed from the FULL
    // approved set via aggregation (same source of truth
    // productController.js's batched review-stats query already uses),
    // not from the capped `reviews` list above, so the cap above can
    // never understate them.
    const statsAgg = await Review.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(req.params.productId),
          isApproved: true,
        },
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
      reviews,
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

  return {
    submission: { productId: safeProductId, order, rating: ratingValue, title: title || "", content },
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

    const { productId: safeProductId, order, rating: ratingValue, title, content } = submission;

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
    });

    res.status(201).json({
      success: true,
      message: "Thanks! Your review will appear once approved by our team.",
      review,
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
    const reviews = await Review.find({
      isApproved: true,
      images: { $exists: true, $not: { $size: 0 } },
    })
      .populate("user", "name")
      .populate("product", "name slug image")
      .sort({ createdAt: -1 })
      .limit(SHOWCASE_LIMIT);

    res.status(200).json({
      success: true,
      reviews,
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
export const getAllReviewsAdmin = async (req, res) => {
  try {
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    // Safety ceiling, not real pagination — see getAllOrders' own
    // comment (orderController.js) for why this pattern was chosen here
    // over a full pagination rework.
    const reviews = await Review.find()
      .populate("user", "name email")
      .populate("product", "name image")
      .sort({ createdAt: sortOrder })
      .limit(2000);

    res.status(200).json({
      success: true,
      reviews,
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
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true },
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Awarded on approval (not at submission) so a spam/low-effort review
    // never earns points — approval is already the moderation checkpoint
    // admins go through anyway, so this rides along with no extra step.
    //
    // Two races used to be possible here: (a) the same review approved
    // twice concurrently, and (b) two different reviews on the same order
    // approved concurrently, both reading "0 awarded so far" and both
    // granting the full bonus, blowing past ORDER_REVIEW_BONUS_CAP. Both
    // are closed below with single-document atomic updates instead of the
    // previous read-then-decide-then-write.
    //
    // The claim, the cap reservation, the points and pointsAwarded commit
    // together in one transaction. The bonus is its own batch, available
    // straight away and valid for 365 days from approval — it doesn't wait
    // for (or share an expiry with) the order's own pending points.
    const award = await withOptionalTransaction(async (session) => {
      const claimedReview = await Review.findOneAndUpdate(
        { _id: review._id, reviewPointsProcessed: { $ne: true } },
        { $set: { reviewPointsProcessed: true } },
        { new: false, session },
      );

      // null means another concurrent request already claimed (or a prior
      // approval already processed) this exact review — nothing more to do.
      if (!claimedReview) return null;

      // No matching Delivered order means no verified purchase — this is
      // a "reward for buying" scheme, not a reward for reviewing, so an
      // unverified review earns nothing (it can still be approved and
      // shown publicly; it just carries no bonus).
      let points = 0;

      if (review.order) {
        // Atomically reserve headroom against the order's shared cap.
        // {new: false} returns the pre-update document, so alreadyAwarded
        // is the true prior total — the read and the write are one atomic
        // step, so a concurrent sibling approval can't see a stale value.
        const orderBefore = await Order.findByIdAndUpdate(
          review.order,
          [
            {
              $set: {
                reviewBonusAwarded: {
                  $min: [
                    ORDER_REVIEW_BONUS_CAP,
                    {
                      $add: [
                        { $ifNull: ["$reviewBonusAwarded", 0] },
                        REVIEW_BONUS_POINTS,
                      ],
                    },
                  ],
                },
              },
            },
          ],
          { new: false, updatePipeline: true, session },
        );

        const alreadyAwarded = orderBefore?.reviewBonusAwarded || 0;

        points = Math.max(0, Math.min(REVIEW_BONUS_POINTS, ORDER_REVIEW_BONUS_CAP - alreadyAwarded));
      }

      if (points > 0) {
        await applyLoyaltyPointsChange({
          userId: review.user,
          type: "earned",
          source: "review",
          points,
          key: `review:${review._id}`,
          order: review.order || null,
          review: review._id,
          description: "Bonus for an approved product review",
          session,
        });
      }

      await Review.updateOne({ _id: review._id }, { $set: { pointsAwarded: points } }, { session });
      return points;
    });

    if (award !== null) review.pointsAwarded = award;

    if (award > 0) {
      notifyUser({
        userId: review.user,
        type: "loyalty_points",
        title: "You earned bonus loyalty points!",
        message: `Your review was approved — ${award} bonus points added to your account.`,
        link: "/loyalty-history",
      });
    }

    res.status(200).json({
      success: true,
      message: "Review approved",
      review,
    });
  } catch (error) {
    console.error("Approve Review Error:", error);

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
    // Claw back any bonus already paid for this review, and free up its
    // share of the order's cap. Without this, deleting a review (e.g. an
    // admin rejecting it as spam after approving it) let the user keep
    // the points while a resubmitted review for the same product/order
    // wrongly saw the cap as still fully used — the combination let a
    // user end up over the per-order cap by deleting and resubmitting.
    // The delete and the reversal commit together; points already spent
    // are recorded as owed.
    const review = await withOptionalTransaction(async (session) => {
      const deleted = await Review.findByIdAndDelete(req.params.id, { session });

      if (deleted?.pointsAwarded > 0) {
        const bonusLot = await LoyaltyLot.findOne({ key: `review:${deleted._id}` })
          .select("_id")
          .session(session);

        await applyLoyaltyPointsChange({
          userId: deleted.user,
          type: "clawback",
          source: "review",
          points: -deleted.pointsAwarded,
          key: `review-reversal:${deleted._id}`,
          order: deleted.order || null,
          review: deleted._id,
          description: "Reversed bonus for a deleted review",
          preferLotIds: bonusLot ? [bonusLot._id] : [],
          allowShortfall: true,
          session,
        });

        if (deleted.order) {
          await Order.findByIdAndUpdate(
            deleted.order,
            { $inc: { reviewBonusAwarded: -deleted.pointsAwarded } },
            { session },
          );
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
