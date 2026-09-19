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
} from "../controllers/articleController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("articles");

router.get("/", getArticles);
router.get("/slug/:slug", getArticleBySlug);

router.get("/admin", authMiddleware, adminMiddleware, perm, getAllArticlesAdmin);
router.get("/admin/:id", authMiddleware, adminMiddleware, perm, getArticleById);
router.post("/", authMiddleware, adminMiddleware, perm, addArticle);
router.put("/:id", authMiddleware, adminMiddleware, perm, updateArticle);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteArticle);
router.post(
  "/upload-image",
  authMiddleware,
  adminMiddleware,
  perm,
  upload.single("image"),
  imageOptimizer,
  uploadArticleImage,
);

export default router;
