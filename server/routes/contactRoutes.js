import express from "express";

import {
  submitMessage,
  getMessages,
  markAsRead,
  deleteMessage,
} from "../controllers/contactController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public
router.post("/", submitMessage);

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, getMessages);
router.put("/:id/read", authMiddleware, adminMiddleware, markAsRead);
router.delete("/:id", authMiddleware, adminMiddleware, deleteMessage);

export default router;
