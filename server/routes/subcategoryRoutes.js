import express from "express";

import {
  getSubcategories,
  getAllSubcategoriesAdmin,
  addSubcategory,
  updateSubcategory,
  restoreSubcategory,
  deleteSubcategory,
  permanentlyDeleteSubcategory,
} from "../controllers/subcategoryController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("subcategories");

// Public — mega menu ke liye
router.get("/", getSubcategories);

// Admin-only
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  perm,
  getAllSubcategoriesAdmin,
);
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  perm,
  upload.single("image"),
  imageOptimizer,
  addSubcategory,
);
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  perm,
  upload.single("image"),
  imageOptimizer,
  updateSubcategory,
);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  restoreSubcategory,
);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteSubcategory);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  permanentlyDeleteSubcategory,
);

export default router;
