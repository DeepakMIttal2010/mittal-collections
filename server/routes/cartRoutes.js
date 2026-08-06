import express from "express";
import {
  syncCart,
  sendAbandonedCartReminders,
} from "../controllers/cartController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/sync", authMiddleware, syncCart);
router.post("/send-abandoned-reminders", sendAbandonedCartReminders);

export default router;
