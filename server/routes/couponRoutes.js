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
import requireWriteAccess from "../middleware/requireWriteAccess.js";

const router = express.Router();
const perm = requirePermission("coupons");
const canCreate = requireWriteAccess("coupons", "new");
const canModify = requireWriteAccess("coupons", "modified");

// Public
router.get("/banner", getBannerCoupon);

// Logged-in customer
router.get("/first-order-offer", authMiddleware, getFirstOrderOffer);
router.post("/validate", authMiddleware, validateCoupon);

// Admin
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllCouponsAdmin);
router.post("/", authMiddleware, adminMiddleware, perm, canCreate, addCoupon);
router.put("/:id", authMiddleware, adminMiddleware, perm, canModify, updateCoupon);
router.put("/:id/restore", authMiddleware, adminMiddleware, perm, canModify, restoreCoupon);
router.delete("/:id", authMiddleware, adminMiddleware, perm, canModify, deleteCoupon);

export default router;
