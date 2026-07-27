import express from "express";

import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} from "../controllers/wishlistController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// GET wishlist
router.get("/", authMiddleware, getWishlist);

// ADD product to wishlist
router.post("/", authMiddleware, addToWishlist);

router.delete("/", authMiddleware, clearWishlist);

// REMOVE product from wishlist
router.delete("/:productId", authMiddleware, removeFromWishlist);

export default router;
