import express from "express";

import {
  getBanners,
  getAllBannersAdmin,
  addBanner,
  updateBanner,
  restoreBanner,
  deleteBanner,
} from "../controllers/bannerController.js";

import upload from "../middleware/uploadMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public
router.get("/", getBanners);

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, getAllBannersAdmin);
router.post("/", authMiddleware, adminMiddleware, upload.single("image"), addBanner);
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  updateBanner,
);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreBanner,
);
router.delete("/:id", authMiddleware, adminMiddleware, deleteBanner);

export default router;
