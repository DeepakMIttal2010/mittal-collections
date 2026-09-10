import express from "express";
import {
  subscribe,
  getSubscribers,
  sendCampaign,
  uploadCampaignImage,
} from "../controllers/newsletterController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("newsletter");

router.post("/subscribe", subscribe);

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
