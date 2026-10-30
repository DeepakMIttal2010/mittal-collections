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
  markReviewSeen,
  deleteReview,
} from "../controllers/reviewController.js";
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
router.put(
  "/:id/approve",
  authMiddleware,
  adminMiddleware,
  perm,
  approveReview,
);
router.put("/:id/seen", authMiddleware, adminMiddleware, perm, markReviewSeen);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteReview);

export default router;
