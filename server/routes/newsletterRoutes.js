import express from "express";
import {
  subscribe,
  unsubscribe,
  getSubscribers,
  sendCampaign,
  uploadCampaignImage,
} from "../controllers/newsletterController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import requirePermission from "../middleware/requirePermission.js";
import { emailTriggerLimiter } from "../middleware/emailTriggerLimiter.js";

const router = express.Router();
const perm = requirePermission("newsletter");

router.post("/subscribe", emailTriggerLimiter, subscribe);
// No rate limit needed -- isValidUnsubscribeToken already rejects
// anything without a real, previously-issued token, so there's no
// cheap way to abuse this at volume the way an open subscribe/email
// endpoint could be.
router.post("/unsubscribe", unsubscribe);

router.get("/admin", authMiddleware, adminMiddleware, perm, getSubscribers);
router.post("/send", authMiddleware, adminMiddleware, perm, sendCampaign);
router.post(
  "/upload-image",
  authMiddleware,
  adminMiddleware,
  perm,
  upload.single("image"),
  imageOptimizer,
  uploadCampaignImage,
);

export default router;
