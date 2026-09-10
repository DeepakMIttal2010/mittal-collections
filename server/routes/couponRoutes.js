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
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("coupons");

// Public
router.get("/banner", getBannerCoupon);

// Logged-in customer
router.get("/first-order-offer", authMiddleware, getFirstOrderOffer);
router.post("/validate", authMiddleware, validateCoupon);

// Admin
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllCouponsAdmin);
router.post("/", authMiddleware, adminMiddleware, perm, addCoupon);
router.put("/:id", authMiddleware, adminMiddleware, perm, updateCoupon);
router.put("/:id/restore", authMiddleware, adminMiddleware, perm, restoreCoupon);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteCoupon);

export default router;
