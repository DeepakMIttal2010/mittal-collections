import Review from "../models/Review.js";
import { applyLoyaltyPointsChange } from "../utils/loyaltyPoints.js";
import { notifyUser } from "../utils/notify.js";

// Flat bonus for a review the admin actually approves — deliberately not
// randomized/"win up to X" (that reads as a chance-based contest, which
// carries real regulatory risk in several Indian states); a guaranteed
// amount is simpler and carries none of that risk.
export const REVIEW_BONUS_POINTS = 50;

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

    if (!productId || !rating || !title || !content) {
      return res.status(400).json({
        success: false,
        message: "Product, rating, title and content are required",
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

    const review = await Review.create({
      product: productId,
      user: req.user._id,
      rating,
      title,
      content,
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
    if (!review.reviewPointsAwarded) {
      await applyLoyaltyPointsChange({
        userId: review.user,
        type: "earned",
        points: REVIEW_BONUS_POINTS,
        description: "Bonus for an approved product review",
      });

      review.reviewPointsAwarded = true;
      await review.save();

      notifyUser({
        userId: review.user,
        type: "loyalty_points",
        title: "You earned bonus loyalty points!",
        message: `Your review was approved — ${REVIEW_BONUS_POINTS} bonus points added to your account.`,
        link: "/account",
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
