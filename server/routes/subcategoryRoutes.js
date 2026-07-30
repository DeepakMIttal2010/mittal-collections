import express from "express";

import {
  getSubcategories,
  getAllSubcategoriesAdmin,
  addSubcategory,
  updateSubcategory,
  restoreSubcategory,
  deleteSubcategory,
} from "../controllers/subcategoryController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

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
router.post("/", authMiddleware, adminMiddleware, addSubcategory);
router.put("/:id", authMiddleware, adminMiddleware, updateSubcategory);
router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreSubcategory,
);
router.delete("/:id", authMiddleware, adminMiddleware, deleteSubcategory);

export default router;
