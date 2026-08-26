import express from "express";

import {
  getDashboardData,
  getNotifications,
  markAllNotificationsRead,
  getReportsData,
  getVisitLog,
  getProductEngagement,
  getProductWishlistUsers,
  getProductCartUsers,
} from "../controllers/adminController.js";
import { getGoogleReportsData } from "../controllers/googleReportsController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Sabhi admin routes: pehle login check, phir admin-role check
router.get("/dashboard", authMiddleware, adminMiddleware, getDashboardData);

router.get(
  "/notifications",
  authMiddleware,
  adminMiddleware,
  getNotifications,
);

router.put(
  "/notifications/mark-all-read",
  authMiddleware,
  adminMiddleware,
  markAllNotificationsRead,
);

router.get("/reports", authMiddleware, adminMiddleware, getReportsData);

router.get(
  "/reports/google",
  authMiddleware,
  adminMiddleware,
  getGoogleReportsData,
);

router.get("/visits", authMiddleware, adminMiddleware, getVisitLog);

router.get(
  "/product-engagement",
  authMiddleware,
  adminMiddleware,
  getProductEngagement,
);

router.get(
  "/product-engagement/:productId/wishlist-users",
  authMiddleware,
  adminMiddleware,
  getProductWishlistUsers,
);

router.get(
  "/product-engagement/:productId/cart-users",
  authMiddleware,
  adminMiddleware,
  getProductCartUsers,
);

export default router;
