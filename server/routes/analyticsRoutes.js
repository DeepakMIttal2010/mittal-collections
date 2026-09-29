import express from "express";

import {
  recordVisit,
  getProductViewCount,
  getMyLocation,
  markInternalDevice,
} from "../controllers/analyticsController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const reportsPerm = requirePermission("reports");

router.post("/visit", recordVisit);
// Security audit (2026-09-29) found this was the one admin route in the
// codebase missing its permission check -- every other admin route
// pairs adminMiddleware with a requirePermission(...) call for the
// section it belongs to; this purges a visitor's PageVisit history
// (analytics/reports data), so it belongs behind "reports" like the
// rest of that section.
router.post("/internal-device", authMiddleware, adminMiddleware, reportsPerm, markInternalDevice);
router.get("/product-views/:id", getProductViewCount);
router.get("/my-location", getMyLocation);

export default router;
