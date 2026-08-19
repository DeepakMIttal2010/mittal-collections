import express from "express";

import {
  getAllTrendingSectionsAdmin,
  addTrendingSection,
  updateTrendingSection,
  restoreTrendingSection,
  deleteTrendingSection,
  permanentlyDeleteTrendingSection,
} from "../controllers/trendingSectionController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Admin-only — the public homepage/page reads sections through
// productController's getTrendingProductsByCategory, not this router.
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  getAllTrendingSectionsAdmin,
);
router.post("/", authMiddleware, adminMiddleware, addTrendingSection);
router.put("/:id", authMiddleware, adminMiddleware, updateTrendingSection);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreTrendingSection,
);
router.delete("/:id", authMiddleware, adminMiddleware, deleteTrendingSection);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeleteTrendingSection,
);

export default router;
