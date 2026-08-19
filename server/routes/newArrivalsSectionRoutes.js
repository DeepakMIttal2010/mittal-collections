import express from "express";

import {
  getAllNewArrivalsSectionsAdmin,
  addNewArrivalsSection,
  updateNewArrivalsSection,
  restoreNewArrivalsSection,
  deleteNewArrivalsSection,
  permanentlyDeleteNewArrivalsSection,
} from "../controllers/newArrivalsSectionController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Admin-only — the public homepage/page reads sections through
// productController's getNewArrivalsByCategory, not this router.
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  getAllNewArrivalsSectionsAdmin,
);
router.post("/", authMiddleware, adminMiddleware, addNewArrivalsSection);
router.put("/:id", authMiddleware, adminMiddleware, updateNewArrivalsSection);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreNewArrivalsSection,
);
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  deleteNewArrivalsSection,
);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeleteNewArrivalsSection,
);

export default router;
