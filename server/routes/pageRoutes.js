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

const router = express.Router();

// Admin-only (must come before the public /:slug route)
router.get("/admin", authMiddleware, adminMiddleware, getAllPagesAdmin);
router.post("/", authMiddleware, adminMiddleware, createPage);
router.put("/:slug", authMiddleware, adminMiddleware, updatePage);
router.put("/:slug/restore", authMiddleware, adminMiddleware, restorePage);
router.delete("/:slug", authMiddleware, adminMiddleware, deletePage);
router.delete(
  "/:slug/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeletePage,
);

// Public
router.get("/:slug", getPageBySlug);

export default router;
