import express from "express";

import { checkPincode } from "../controllers/deliveryController.js";
import {
  recordDeliveryDemand,
  getDeliveryDemandReport,
  exportDeliveryDemandCsv,
  getDeliveryDemandRecords,
} from "../controllers/deliveryDemandController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";
import optionalAuth from "../middleware/optionalAuth.js";
import { deliveryDemandLimiter } from "../middleware/deliveryDemandLimiter.js";

const router = express.Router();

router.get("/check-pincode/:pincode", checkPincode);

// PR-B2 Delivery Demand: demand beacon (public, guests count too) and the
// admin report. Neither changes delivery eligibility.
router.post("/demand", deliveryDemandLimiter, optionalAuth, recordDeliveryDemand);

const perm = requirePermission("delivery-demand");
router.get("/demand/report", authMiddleware, adminMiddleware, perm, getDeliveryDemandReport);
router.get("/demand/records", authMiddleware, adminMiddleware, perm, getDeliveryDemandRecords);
router.get("/demand/export", authMiddleware, adminMiddleware, perm, exportDeliveryDemandCsv);

export default router;
