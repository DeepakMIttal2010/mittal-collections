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

// TEMPORARY diagnostic route — remove after use. Confirms whether the
// TTL index on pagevisits/searchlogs actually landed on this deployed
// DB after the retention-fix deploy (autoIndex behavior needed a
// direct check, not an assumption).
router.get("/_debug_indexes", authMiddleware, adminMiddleware, async (req, res) => {
  const db = mongoose.connection.db;
  const result = {};
  for (const name of ["pagevisits", "searchlogs"]) {
    result[name] = await db.collection(name).indexes();
  }
  res.json(result);
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
