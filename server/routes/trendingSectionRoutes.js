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
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("trending");

// Admin-only — the public homepage/page reads sections through
// productController's getTrendingProductsByCategory, not this router.
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  perm,
  getAllTrendingSectionsAdmin,
);
router.post("/", authMiddleware, adminMiddleware, perm, addTrendingSection);
router.put("/:id", authMiddleware, adminMiddleware, perm, updateTrendingSection);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  restoreTrendingSection,
);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteTrendingSection);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  permanentlyDeleteTrendingSection,
);

export default router;
