import express from "express";

import {
  getFooterLinks,
  getAllFooterLinksAdmin,
  createFooterLink,
  updateFooterLink,
  deleteFooterLink,
} from "../controllers/footerLinkController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, getAllFooterLinksAdmin);
router.post("/", authMiddleware, adminMiddleware, createFooterLink);
router.put("/:id", authMiddleware, adminMiddleware, updateFooterLink);
router.delete("/:id", authMiddleware, adminMiddleware, deleteFooterLink);

// Public
router.get("/", getFooterLinks);

export default router;
