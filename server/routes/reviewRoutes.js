import express from "express";

import {
  getProductReviews,
  submitReview,
  getAllReviewsAdmin,
  approveReview,
  markReviewSeen,
  deleteReview,
} from "../controllers/reviewController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/product/:productId", getProductReviews);
router.post("/", authMiddleware, submitReview);

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
