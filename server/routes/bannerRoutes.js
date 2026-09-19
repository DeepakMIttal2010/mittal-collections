import express from "express";

import {
  getBanners,
  getAllBannersAdmin,
  addBanner,
  updateBanner,
  restoreBanner,
  deleteBanner,
  permanentlyDeleteBanner,
} from "../controllers/bannerController.js";

import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("banners");

// Public
router.get("/", getBanners);

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllBannersAdmin);
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  perm,
  upload.single("image"),
  imageOptimizer,
  addBanner,
);
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  perm,
  upload.single("image"),
  imageOptimizer,
  updateBanner,
);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  restoreBanner,
);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteBanner);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  permanentlyDeleteBanner,
);

export default router;
