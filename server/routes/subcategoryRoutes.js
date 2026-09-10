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
import requireWriteAccess from "../middleware/requireWriteAccess.js";

const router = express.Router();
const perm = requirePermission("subcategories");
const canCreate = requireWriteAccess("subcategories", "new");
const canModify = requireWriteAccess("subcategories", "modified");

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
  canCreate,
  upload.single("image"),
  imageOptimizer,
  addSubcategory,
);
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  upload.single("image"),
  imageOptimizer,
  updateSubcategory,
);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  restoreSubcategory,
);
router.delete("/:id", authMiddleware, adminMiddleware, perm, canModify, deleteSubcategory);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  permanentlyDeleteSubcategory,
);

export default router;
