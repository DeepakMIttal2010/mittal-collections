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

const router = express.Router();

router.post("/subscribe", subscribe);

router.get("/admin", authMiddleware, adminMiddleware, getSubscribers);
router.post("/send", authMiddleware, adminMiddleware, sendCampaign);
router.post(
  "/upload-image",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  imageOptimizer,
  uploadCampaignImage,
);

export default router;
