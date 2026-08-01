import express from "express";

import {
  getBannerCoupon,
  getFirstOrderOffer,
  validateCoupon,
  getAllCouponsAdmin,
  addCoupon,
  updateCoupon,
  deleteCoupon,
  restoreCoupon,
} from "../controllers/couponController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public
router.get("/banner", getBannerCoupon);

// Logged-in customer
router.get("/first-order-offer", authMiddleware, getFirstOrderOffer);
router.post("/validate", authMiddleware, validateCoupon);

// Admin
router.get("/admin", authMiddleware, adminMiddleware, getAllCouponsAdmin);
router.post("/", authMiddleware, adminMiddleware, addCoupon);
router.put("/:id", authMiddleware, adminMiddleware, updateCoupon);
router.put("/:id/restore", authMiddleware, adminMiddleware, restoreCoupon);
router.delete("/:id", authMiddleware, adminMiddleware, deleteCoupon);

export default router;
