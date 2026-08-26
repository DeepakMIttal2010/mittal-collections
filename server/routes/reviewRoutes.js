import express from "express";

import {
  getProductReviews,
  getShowcaseReviews,
  submitReview,
  getAllReviewsAdmin,
  approveReview,
  markReviewSeen,
  deleteReview,
} from "../controllers/reviewController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { uploadReviewMedia } from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";

const router = express.Router();

router.get("/showcase", getShowcaseReviews);
router.get("/product/:productId", getProductReviews);
router.post(
  "/",
  authMiddleware,
  uploadReviewMedia.fields([
    { name: "images", maxCount: 3 },
    { name: "video", maxCount: 1 },
  ]),
  imageOptimizer,
  submitReview,
);

router.get("/admin", authMiddleware, adminMiddleware, getAllReviewsAdmin);
router.put(
  "/:id/approve",
  authMiddleware,
  adminMiddleware,
  approveReview,
);
router.put("/:id/seen", authMiddleware, adminMiddleware, markReviewSeen);
router.delete("/:id", authMiddleware, adminMiddleware, deleteReview);

export default router;
