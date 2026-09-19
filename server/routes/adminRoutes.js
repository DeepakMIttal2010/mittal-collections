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
  getProductViewUsers,
  getEngagementDetails,
  getAbandonedCartDetails,
} from "../controllers/adminController.js";
import { getGoogleReportsData } from "../controllers/googleReportsController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const dashboardPerm = requirePermission("dashboard");
const reportsPerm = requirePermission("reports");

// Sabhi admin routes: pehle login check, phir admin-role check
router.get("/dashboard", authMiddleware, adminMiddleware, dashboardPerm, getDashboardData);

// The notification bell is a persistent header widget every admin
// account sees, not a distinct section a role can be granted/denied —
// deliberately left ungated beyond the existing admin-only check.
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

router.get("/reports", authMiddleware, adminMiddleware, reportsPerm, getReportsData);

router.get(
  "/reports/google",
  authMiddleware,
  adminMiddleware,
  reportsPerm,
  getGoogleReportsData,
);

router.get("/visits", authMiddleware, adminMiddleware, reportsPerm, getVisitLog);

router.get(
  "/product-engagement",
  authMiddleware,
  adminMiddleware,
  reportsPerm,
  getProductEngagement,
);

router.get(
  "/product-engagement/:productId/wishlist-users",
  authMiddleware,
  adminMiddleware,
  reportsPerm,
  getProductWishlistUsers,
);

router.get(
  "/product-engagement/:productId/cart-users",
  authMiddleware,
  adminMiddleware,
  reportsPerm,
  getProductCartUsers,
);

router.get(
  "/product-engagement/:productId/view-users",
  authMiddleware,
  adminMiddleware,
  reportsPerm,
  getProductViewUsers,
);

router.get(
  "/product-engagement/details",
  authMiddleware,
  adminMiddleware,
  reportsPerm,
  getEngagementDetails,
);

router.get(
  "/abandoned-carts",
  authMiddleware,
  adminMiddleware,
  reportsPerm,
  getAbandonedCartDetails,
);

export default router;
