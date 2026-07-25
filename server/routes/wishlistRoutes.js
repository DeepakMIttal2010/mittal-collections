import express from "express";

import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "../controllers/wishlistController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// GET wishlist
router.get("/", authMiddleware, getWishlist);

// ADD product to wishlist
router.post("/", authMiddleware, addToWishlist);

// REMOVE product from wishlist
router.delete("/:productId", authMiddleware, removeFromWishlist);

export default router;
