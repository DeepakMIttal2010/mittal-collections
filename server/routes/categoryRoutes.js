import express from "express";
import {
  getCategories,
  getCategoryById,
  addCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";

import upload from "../middleware/uploadMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public Routes
router.get("/", getCategories);
router.get("/:id", getCategoryById);

// Admin-only Routes
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

router.delete("/:id", authMiddleware, adminMiddleware, deleteCategory);

export default router;
