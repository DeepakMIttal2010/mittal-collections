import express from "express";
import {
  syncCart,
  sendAbandonedCartReminders,
} from "../controllers/cartController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/sync", authMiddleware, syncCart);
// GET as well as POST — most external cron pingers (cron-job.org
// included) default to GET and don't reliably offer a way to change
// it, so both are accepted for this secret-protected trigger endpoint.
router.post("/send-abandoned-reminders", sendAbandonedCartReminders);
router.get("/send-abandoned-reminders", sendAbandonedCartReminders);

export default router;
