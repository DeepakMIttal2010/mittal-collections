import express from "express";
import validateObjectId from "../middleware/validateObjectId.js";

import {
  getProductReviews,
  getShowcaseReviews,
  submitReview,
  validateReviewSubmission,
  getReviewEligibility,
  getAllReviewsAdmin,
  approveReview,
  reverseReviewBonus,
  grantReviewBonus,
  markReviewSeen,
  deleteReview,
} from "../controllers/reviewController.js";
import {
  hideReview,
  unhideReview,
  setReviewReply,
  deleteReviewReply,
  getReviewSummary,
} from "../controllers/reviewModerationController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { uploadReviewMedia } from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import requirePermission from "../middleware/requirePermission.js";
import { uploadLimiter } from "../middleware/uploadLimiter.js";

const router = express.Router();

router.param("id", validateObjectId);
router.param("productId", validateObjectId);
const perm = requirePermission("reviews");
// Reversing a review's bonus moves a customer's points, so it also needs
// the "loyalty" action permission (full admins pass both).
const loyaltyPerm = requirePermission("loyalty");

router.get("/showcase", getShowcaseReviews);
router.get("/product/:productId", getProductReviews);
router.get("/eligibility/:productId", authMiddleware, getReviewEligibility);
router.post(
  "/",
  authMiddleware,
  uploadLimiter,
  uploadReviewMedia.fields([
    { name: "images", maxCount: 3 },
    { name: "video", maxCount: 1 },
  ]),
  // Before imageOptimizer, which is what uploads to Cloudinary: an
  // ineligible or invalid submission is turned away with its files still
  // only in memory, never stored.
  validateReviewSubmission,
  imageOptimizer,
  submitReview,
);

router.get("/admin", authMiddleware, adminMiddleware, perm, getAllReviewsAdmin);
router.get("/admin/summary", authMiddleware, adminMiddleware, perm, getReviewSummary);
router.put(
  "/:id/approve",
  authMiddleware,
  adminMiddleware,
  perm,
  approveReview,
);
router.post(
  "/:id/reverse-bonus",
  authMiddleware,
  adminMiddleware,
  perm,
  loyaltyPerm,
  reverseReviewBonus,
);
// A bonus held at approval (the item was being returned) — paid later, once
// the return was rejected, after re-checking eligibility. Moves a
// customer's points, so it needs "loyalty" too, like reverse-bonus.
router.post(
  "/:id/grant-bonus",
  authMiddleware,
  adminMiddleware,
  perm,
  loyaltyPerm,
  grantReviewBonus,
);
router.put("/:id/seen", authMiddleware, adminMiddleware, perm, markReviewSeen);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteReview);

// Moderation (PR3a) — same admin + "reviews" permission gate as above.
router.put("/:id/hide", authMiddleware, adminMiddleware, perm, hideReview);
router.put("/:id/unhide", authMiddleware, adminMiddleware, perm, unhideReview);
router.put("/:id/reply", authMiddleware, adminMiddleware, perm, setReviewReply);
router.delete("/:id/reply", authMiddleware, adminMiddleware, perm, deleteReviewReply);

export default router;
