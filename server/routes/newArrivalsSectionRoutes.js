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
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("new-arrivals");

// Admin-only — the public homepage/page reads sections through
// productController's getNewArrivalsByCategory, not this router.
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  perm,
  getAllNewArrivalsSectionsAdmin,
);
router.post("/", authMiddleware, adminMiddleware, perm, addNewArrivalsSection);
router.put("/:id", authMiddleware, adminMiddleware, perm, updateNewArrivalsSection);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  restoreNewArrivalsSection,
);
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  perm,
  deleteNewArrivalsSection,
);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  permanentlyDeleteNewArrivalsSection,
);

export default router;
