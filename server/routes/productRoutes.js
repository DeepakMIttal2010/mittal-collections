import express from "express";
import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

import {
  getProducts,
  getAllProductsAdmin,
  getTrendingProducts,
  getProductById,
  addProduct,
  updateProduct,
  restoreProduct,
  deleteProduct,
  permanentlyDeleteProduct,
} from "../controllers/productController.js";

const router = express.Router();

// Public routes — koi bhi dekh sakta hai
router.get("/", getProducts);
router.get("/trending", getTrendingProducts);

// Admin-only routes — login + admin role dono zaroori (must come before /:id)
router.get("/admin", authMiddleware, adminMiddleware, getAllProductsAdmin);

router.get("/:id", getProductById);

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  upload.array("images", 6),
  imageOptimizer,
  addProduct,
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  upload.array("images", 6),
  imageOptimizer,
  updateProduct,
);

router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  restoreProduct,
);

router.delete("/:id", authMiddleware, adminMiddleware, deleteProduct);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeleteProduct,
);

export default router;
