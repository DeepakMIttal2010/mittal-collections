import express from "express";
import {
  getRewardsSettings,
  updateLoyaltySettings,
  updateReferralSettings,
  getPublicRewardsInfo,
  getMyLoyaltyTransactions,
} from "../controllers/rewardsSettingsController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/public", getPublicRewardsInfo);
router.get(
  "/my-transactions",
  authMiddleware,
  getMyLoyaltyTransactions,
);

router.get("/admin", authMiddleware, adminMiddleware, getRewardsSettings);
router.put(
  "/admin/loyalty",
  authMiddleware,
  adminMiddleware,
  updateLoyaltySettings,
);
router.put(
  "/admin/referral",
  authMiddleware,
  adminMiddleware,
  updateReferralSettings,
);

export default router;
