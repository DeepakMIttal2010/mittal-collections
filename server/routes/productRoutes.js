import express from "express";
import { uploadProductMedia } from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";
import requireWriteAccess from "../middleware/requireWriteAccess.js";

import {
  getProducts,
  getAllProductsAdmin,
  getProductByIdAdmin,
  duplicateProduct,
  decodeProductNumberController,
  getTrendingProducts,
  getTrendingProductsByCategory,
  getNewArrivalProducts,
  getNewArrivalsByCategory,
  getGiftingProducts,
  getBestSellers,
  getBigSavingsProducts,
  getSearchSuggestions,
  getProductById,
  addProduct,
  updateProduct,
  restoreProduct,
  deleteProduct,
  permanentlyDeleteProduct,
  subscribeStockAlert,
} from "../controllers/productController.js";

const router = express.Router();
const perm = requirePermission("products");
const canCreate = requireWriteAccess("products", "new");
const canModify = requireWriteAccess("products", "modified");

// Public routes — koi bhi dekh sakta hai
router.get("/", getProducts);
router.get("/trending", getTrendingProducts);
router.get("/trending-by-category", getTrendingProductsByCategory);
router.get("/new-arrivals", getNewArrivalProducts);
router.get("/new-arrivals-by-category", getNewArrivalsByCategory);
router.get("/gifting", getGiftingProducts);
router.get("/best-sellers", getBestSellers);
router.get("/big-savings", getBigSavingsProducts);
router.get("/suggestions", getSearchSuggestions);

// Admin-only routes — login + admin role dono zaroori (must come before /:id)
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllProductsAdmin);
router.get(
  "/decode-number",
  authMiddleware,
  adminMiddleware,
  perm,
  decodeProductNumberController,
);

router.get("/:id", getProductById);
router.get("/:id/admin", authMiddleware, adminMiddleware, perm, getProductByIdAdmin);
router.post("/:id/notify", subscribeStockAlert);

const productMediaFields = uploadProductMedia.fields([
  { name: "images", maxCount: 6 },
  { name: "videos", maxCount: 2 },
]);

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  perm,
  canCreate,
  productMediaFields,
  imageOptimizer,
  addProduct,
);

router.post(
  "/:id/duplicate",
  authMiddleware,
  adminMiddleware,
  perm,
  canCreate,
  duplicateProduct,
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  productMediaFields,
  imageOptimizer,
  updateProduct,
);

router.put(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  restoreProduct,
);

router.delete("/:id", authMiddleware, adminMiddleware, perm, canModify, deleteProduct);
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  permanentlyDeleteProduct,
);

export default router;
