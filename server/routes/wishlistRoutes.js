import express from "express";

import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  getGuestWishlist,
  addToGuestWishlist,
  removeFromGuestWishlist,
  clearGuestWishlist,
  mergeGuestWishlist,
  sendPriceDropAlerts,
} from "../controllers/wishlistController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// GET as well as POST — most external cron pingers (cron-job.org
// included) default to GET and don't reliably offer a way to change it,
// so both are accepted for this secret-protected trigger endpoint.
router.post("/send-price-drop-alerts", sendPriceDropAlerts);
router.get("/send-price-drop-alerts", sendPriceDropAlerts);

// Guest wishlist — no auth, keyed by visitorId instead of a logged-in user.
router.get("/guest/:visitorId", getGuestWishlist);
router.post("/guest", addToGuestWishlist);
router.delete("/guest/:visitorId", clearGuestWishlist);
router.delete("/guest/:visitorId/:productId", removeFromGuestWishlist);

// Called once right after login to fold a just-logged-in customer's
// guest wishlist into their account.
router.post("/merge-guest", authMiddleware, mergeGuestWishlist);

// GET wishlist
router.get("/", authMiddleware, getWishlist);

// ADD product to wishlist
router.post("/", authMiddleware, addToWishlist);

router.delete("/", authMiddleware, clearWishlist);

// REMOVE product from wishlist
router.delete("/:productId", authMiddleware, removeFromWishlist);

export default router;
