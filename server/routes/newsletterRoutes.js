import express from "express";
import {
  subscribe,
  getSubscribers,
  sendCampaign,
} from "../controllers/newsletterController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.post("/subscribe", subscribe);

router.get("/admin", authMiddleware, adminMiddleware, getSubscribers);
router.post("/send", authMiddleware, adminMiddleware, sendCampaign);

export default router;
