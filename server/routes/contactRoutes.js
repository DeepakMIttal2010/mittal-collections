import express from "express";

import {
  submitMessage,
  getMessages,
  markAsRead,
  deleteMessage,
} from "../controllers/contactController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";
import { emailTriggerLimiter } from "../middleware/emailTriggerLimiter.js";

const router = express.Router();
const perm = requirePermission("messages");

// Public
router.post("/", emailTriggerLimiter, submitMessage);

// Admin-only
router.get("/admin", authMiddleware, adminMiddleware, perm, getMessages);
router.put("/:id/read", authMiddleware, adminMiddleware, perm, markAsRead);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteMessage);

export default router;
