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
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public Routes
router.get("/", getCategories);

// Admin-only Routes (must come before /:id)
router.get("/admin", authMiddleware, adminMiddleware, getAllCategoriesAdmin);

router.get("/:id", getCategoryById);

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  addCategory,
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  updateCategory,
);

router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreCategory,
);

router.delete("/:id", authMiddleware, adminMiddleware, deleteCategory);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeleteCategory,
);

export default router;
