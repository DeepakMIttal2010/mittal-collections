import express from "express";

import {
  getPageBySlug,
  getAllPagesAdmin,
  createPage,
  updatePage,
  restorePage,
  deletePage,
  permanentlyDeletePage,
} from "../controllers/pageController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("pages");

// Admin-only (must come before the public /:slug route)
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllPagesAdmin);
router.post("/", authMiddleware, adminMiddleware, perm, createPage);
router.put("/:slug", authMiddleware, adminMiddleware, perm, updatePage);
router.put("/:slug/restore", authMiddleware, adminMiddleware, perm, restorePage);
router.delete("/:slug", authMiddleware, adminMiddleware, perm, deletePage);
router.delete(
  "/:slug/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  permanentlyDeletePage,
);

// Public
router.get("/:slug", getPageBySlug);

export default router;
