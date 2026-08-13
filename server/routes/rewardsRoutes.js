import express from "express";
import {
  getRewardsSettings,
  updateLoyaltySettings,
  updateReferralSettings,
  getPublicRewardsInfo,
  getMyLoyaltyTransactions,
  runPointsExpiry,
} from "../controllers/rewardsSettingsController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/public", getPublicRewardsInfo);
// GET as well as POST — most external cron pingers (cron-job.org
// included) default to GET and don't reliably offer a way to change
// it, so both are accepted for this secret-protected trigger endpoint.
router.post("/expire-points", runPointsExpiry);
router.get("/expire-points", runPointsExpiry);
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
