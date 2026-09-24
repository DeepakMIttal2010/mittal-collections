import express from "express";

import {
  recordVisit,
  getProductViewCount,
  getMyLocation,
  markInternalDevice,
} from "../controllers/analyticsController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.post("/visit", recordVisit);
router.post("/internal-device", authMiddleware, adminMiddleware, markInternalDevice);
router.get("/product-views/:id", getProductViewCount);
router.get("/my-location", getMyLocation);

export default router;
