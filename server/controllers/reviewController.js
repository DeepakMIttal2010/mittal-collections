import Review from "../models/Review.js";
import Order from "../models/Order.js";
import cloudinary from "../config/cloudinary.js";
import { applyLoyaltyPointsChange } from "../utils/loyaltyPoints.js";
import { notifyUser } from "../utils/notify.js";

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
    const reviews = await Review.find({
      product: req.params.productId,
      isApproved: true,
    })
      .populate("user", "name")
      .sort({ createdAt: -1 });

    const totalReviews = reviews.length;
    const averageRating = totalReviews
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

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

// ============================
// SUBMIT REVIEW (Logged-in user)
// ============================
export const submitReview = async (req, res) => {
  try {
    const { productId, rating, title, content } = req.body;

    if (!productId || !rating || !content) {
      return res.status(400).json({
        success: false,
        message: "Product, rating and content are required",
      });
    }

    const existing = await Review.findOne({
      product: productId,
      user: req.user._id,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    const videoFile = req.files?.video?.[0];

    if (videoFile) {
      const duration = videoFile.cloudinaryResult?.duration;

      if (duration && duration > MAX_REVIEW_VIDEO_SECONDS) {
        await cloudinary.uploader.destroy(videoFile.cloudinaryResult.public_id, {
          resource_type: "video",
        });

        return res.status(400).json({
          success: false,
          message: `Video must be ${MAX_REVIEW_VIDEO_SECONDS} seconds or shorter`,
        });
      }
    }

    const images = (req.files?.images || []).map((file) => file.path);

    // Only reviews tied to a Delivered order count toward the per-order
    // bonus cap — a review with no matching order just gets the flat
    // amount uncapped (e.g. seeded/legacy data).
    const order = await Order.findOne({
      user: req.user._id,
      orderStatus: "Delivered",
      "orderItems.product": productId,
    }).sort({ createdAt: -1 });

    const review = await Review.create({
      product: productId,
      user: req.user._id,
      order: order?._id || null,
      rating,
      title: title || "",
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
    console.error("Submit Review Error:", error);

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

    const reviews = await Review.find()
      .populate("user", "name email")
      .populate("product", "name image")
      .sort({ createdAt: sortOrder });

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
    if (!review.reviewPointsProcessed) {
      let award = REVIEW_BONUS_POINTS;

      if (review.order) {
        // Other already-approved reviews from the same order eat into the
        // shared cap — this one gets whatever headroom is left, which can
        // be less than the flat amount, or zero.
        const otherReviews = await Review.find({
          order: review.order,
          _id: { $ne: review._id },
          reviewPointsProcessed: true,
        });

        const alreadyAwarded = otherReviews.reduce((sum, r) => sum + r.pointsAwarded, 0);

        award = Math.max(0, Math.min(REVIEW_BONUS_POINTS, ORDER_REVIEW_BONUS_CAP - alreadyAwarded));
      }

      if (award > 0) {
        await applyLoyaltyPointsChange({
          userId: review.user,
          type: "earned",
          points: award,
          description: "Bonus for an approved product review",
        });

        notifyUser({
          userId: review.user,
          type: "loyalty_points",
          title: "You earned bonus loyalty points!",
          message: `Your review was approved — ${award} bonus points added to your account.`,
          link: "/account",
        });
      }

      review.pointsAwarded = award;
      review.reviewPointsProcessed = true;
      await review.save();
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
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

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
