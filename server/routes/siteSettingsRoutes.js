import express from "express";

import {
  getSiteSettings,
  getSiteSettingsAdmin,
  updateSiteSettings,
} from "../controllers/siteSettingsController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.get("/", getSiteSettings);
// Includes the internal pricing rules -- any admin account (the Add/Edit
// Product forms need them for auto-fill, the Pricing Rules page to edit).
router.get("/admin", authMiddleware, adminMiddleware, getSiteSettingsAdmin);
router.put("/", authMiddleware, adminMiddleware, requirePermission("settings"), updateSiteSettings);

export default router;
