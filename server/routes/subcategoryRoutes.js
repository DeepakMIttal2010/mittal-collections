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

const router = express.Router();

// Public — mega menu ke liye
router.get("/", getSubcategories);

// Admin-only
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  getAllSubcategoriesAdmin,
);
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  addSubcategory,
);
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  updateSubcategory,
);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreSubcategory,
);
router.delete("/:id", authMiddleware, adminMiddleware, deleteSubcategory);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeleteSubcategory,
);

export default router;
