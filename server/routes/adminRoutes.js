import express from "express";
import mongoose from "mongoose";

import {
  getDashboardData,
  getNotifications,
  markAllNotificationsRead,
  getReportsData,
  getVisitLog,
} from "../controllers/adminController.js";
import { getGoogleReportsData } from "../controllers/googleReportsController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// TEMPORARY diagnostic route — remove after use. Confirms the actual
// production database name so the GitHub Actions backup workflow's
// mongodump can target it explicitly with --db (investigating why the
// weekly backup artifact is coming back empty despite the step
// reporting success).
router.get("/_debug_dbname", authMiddleware, adminMiddleware, async (req, res) => {
  res.json({
    databaseName: mongoose.connection.db.databaseName,
    collections: (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name),
  });
});

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

export default router;
