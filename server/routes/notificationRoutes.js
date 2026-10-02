import express from "express";
import validateObjectId from "../middleware/validateObjectId.js";
import authMiddleware from "../middleware/authMiddleware.js";

import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notificationController.js";

const router = express.Router();

router.param("id", validateObjectId);

router.get("/", authMiddleware, getMyNotifications);
router.put("/mark-all-read", authMiddleware, markAllNotificationsRead);
router.put("/:id/read", authMiddleware, markNotificationRead);

export default router;
