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

const router = express.Router();

// Public
router.get("/", getPriceRanges);

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, getAllPriceRangesAdmin);
router.post("/", authMiddleware, adminMiddleware, addPriceRange);
router.put("/:id", authMiddleware, adminMiddleware, updatePriceRange);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restorePriceRange,
);
router.delete("/:id", authMiddleware, adminMiddleware, deletePriceRange);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeletePriceRange,
);

export default router;
