import express from "express";

import {
  getSiteSettings,
  updateSiteSettings,
} from "../controllers/siteSettingsController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/", getSiteSettings);
router.put("/", authMiddleware, adminMiddleware, updateSiteSettings);

export default router;
