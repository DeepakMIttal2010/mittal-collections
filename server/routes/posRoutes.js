import express from "express";

import {
  getProductForPOS,
  lookupCustomerByMobile,
  recordOfflineSale,
  getOfflineSales,
} from "../controllers/posController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get(
  "/product/:id",
  authMiddleware,
  adminMiddleware,
  getProductForPOS,
);
router.get("/customer", authMiddleware, adminMiddleware, lookupCustomerByMobile);
router.post("/sale", authMiddleware, adminMiddleware, recordOfflineSale);
router.get("/sales", authMiddleware, adminMiddleware, getOfflineSales);

export default router;
