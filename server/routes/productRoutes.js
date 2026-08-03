import express from "express";
import { uploadProductMedia } from "../middleware/uploadMiddleware.js";
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

const productMediaFields = uploadProductMedia.fields([
  { name: "images", maxCount: 6 },
  { name: "videos", maxCount: 2 },
]);

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  productMediaFields,
  imageOptimizer,
  addProduct,
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  productMediaFields,
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
