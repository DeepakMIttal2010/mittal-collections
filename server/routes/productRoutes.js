import express from "express";
import upload from "../middleware/uploadMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

import {
  getProducts,
  getProductById,
  addProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";

const router = express.Router();

// Public routes — koi bhi dekh sakta hai
router.get("/", getProducts);
router.get("/:id", getProductById);

// Admin-only routes — login + admin role dono zaroori
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  addProduct,
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  updateProduct,
);

router.delete("/:id", authMiddleware, adminMiddleware, deleteProduct);

export default router;
