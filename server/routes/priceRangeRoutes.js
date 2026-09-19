import express from "express";

import {
  getPriceRanges,
  getAllPriceRangesAdmin,
  addPriceRange,
  updatePriceRange,
  restorePriceRange,
  deletePriceRange,
  permanentlyDeletePriceRange,
} from "../controllers/priceRangeController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("price-ranges");

// Public
router.get("/", getPriceRanges);

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllPriceRangesAdmin);
router.post("/", authMiddleware, adminMiddleware, perm, addPriceRange);
router.put("/:id", authMiddleware, adminMiddleware, perm, updatePriceRange);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  restorePriceRange,
);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deletePriceRange);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  permanentlyDeletePriceRange,
);

export default router;
