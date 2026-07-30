import express from "express";
import upload from "../middleware/uploadMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

import {
  getProducts,
  getAllProductsAdmin,
  getProductById,
  addProduct,
  updateProduct,
  restoreProduct,
  deleteProduct,
} from "../controllers/productController.js";

const router = express.Router();

// Public routes — koi bhi dekh sakta hai
router.get("/", getProducts);

// Admin-only routes — login + admin role dono zaroori (must come before /:id)
router.get("/admin", authMiddleware, adminMiddleware, getAllProductsAdmin);

router.get("/:id", getProductById);

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  upload.array("images", 6),
  addProduct,
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  upload.array("images", 6),
  updateProduct,
);

router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreProduct,
);

router.delete("/:id", authMiddleware, adminMiddleware, deleteProduct);

export default router;
