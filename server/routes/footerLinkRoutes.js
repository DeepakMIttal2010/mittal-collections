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
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("footer-links");

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllFooterLinksAdmin);
router.post("/", authMiddleware, adminMiddleware, perm, createFooterLink);
router.put("/:id", authMiddleware, adminMiddleware, perm, updateFooterLink);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteFooterLink);

// Public
router.get("/", getFooterLinks);

export default router;
