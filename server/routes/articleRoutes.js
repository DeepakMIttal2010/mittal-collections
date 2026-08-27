import express from "express";
import {
  getArticles,
  getArticleBySlug,
  getAllArticlesAdmin,
  getArticleById,
  addArticle,
  updateArticle,
  deleteArticle,
  uploadArticleImage,
  hindiBulkSync,
} from "../controllers/articleController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";

const router = express.Router();

router.get("/", getArticles);
router.get("/slug/:slug", getArticleBySlug);

router.get("/admin", authMiddleware, adminMiddleware, getAllArticlesAdmin);
router.get("/admin/:id", authMiddleware, adminMiddleware, getArticleById);
router.post("/", authMiddleware, adminMiddleware, addArticle);
router.put("/:id", authMiddleware, adminMiddleware, updateArticle);
router.delete("/:id", authMiddleware, adminMiddleware, deleteArticle);
router.post(
  "/upload-image",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  imageOptimizer,
  uploadArticleImage,
);
// Temporary — see hindiBulkSync's own comment. Remove once run.
router.post("/hindi-bulk-sync", hindiBulkSync);

export default router;
