import express from "express";
import {
  getCategories,
  getAllCategoriesAdmin,
  getCategoryById,
  addCategory,
  updateCategory,
  restoreCategory,
  deleteCategory,
  permanentlyDeleteCategory,
} from "../controllers/categoryController.js";

import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";
import requireWriteAccess from "../middleware/requireWriteAccess.js";

const router = express.Router();
const perm = requirePermission("categories");
const canCreate = requireWriteAccess("categories", "new");
const canModify = requireWriteAccess("categories", "modified");

// Public Routes
router.get("/", getCategories);

// Admin-only Routes (must come before /:id)
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllCategoriesAdmin);

router.get("/:id", getCategoryById);

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  perm,
  canCreate,
  upload.single("image"),
  imageOptimizer,
  addCategory,
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  upload.single("image"),
  imageOptimizer,
  updateCategory,
);

router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  restoreCategory,
);

router.delete("/:id", authMiddleware, adminMiddleware, perm, canModify, deleteCategory);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  permanentlyDeleteCategory,
);

export default router;
