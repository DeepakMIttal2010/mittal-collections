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

// TEMPORARY diagnostic + cleanup route — remove after use. autoIndex
// created the new TTL createdAt_1 index but left the old createdAt_-1
// index in place (different key direction, so Mongo treated it as a
// separate index rather than replacing it) — this drops the redundant
// old one.
router.get("/_debug_indexes", authMiddleware, adminMiddleware, async (req, res) => {
  const db = mongoose.connection.db;

  if (req.query.dropOld === "true") {
    for (const name of ["pagevisits", "searchlogs"]) {
      const indexes = await db.collection(name).indexes();
      const oldIndex = indexes.find((i) => i.name === "createdAt_-1");
      if (oldIndex) {
        await db.collection(name).dropIndex(oldIndex.name);
      }
    }
  }

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
