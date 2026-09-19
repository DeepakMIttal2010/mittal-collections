import express from "express";

import {
  getProductForPOS,
  lookupCustomerByMobile,
  recordOfflineSale,
  getOfflineSales,
} from "../controllers/posController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import imageOptimizer from "../middleware/imageOptimizer.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("pos");

router.get(
  "/product/:id",
  authMiddleware,
  adminMiddleware,
  perm,
  getProductForPOS,
);
router.get("/customer", authMiddleware, adminMiddleware, perm, lookupCustomerByMobile);
router.post(
  "/sale",
  authMiddleware,
  adminMiddleware,
  perm,
  upload.single("paymentProof"),
  imageOptimizer,
  recordOfflineSale,
);
router.get("/sales", authMiddleware, adminMiddleware, perm, getOfflineSales);

export default router;
