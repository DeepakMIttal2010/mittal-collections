import express from "express";

import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  sendPriceDropAlerts,
} from "../controllers/wishlistController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// GET as well as POST — most external cron pingers (cron-job.org
// included) default to GET and don't reliably offer a way to change it,
// so both are accepted for this secret-protected trigger endpoint.
router.post("/send-price-drop-alerts", sendPriceDropAlerts);
router.get("/send-price-drop-alerts", sendPriceDropAlerts);

// GET wishlist
router.get("/", authMiddleware, getWishlist);

// ADD product to wishlist
router.post("/", authMiddleware, addToWishlist);

router.delete("/", authMiddleware, clearWishlist);

// REMOVE product from wishlist
router.delete("/:productId", authMiddleware, removeFromWishlist);

export default router;
