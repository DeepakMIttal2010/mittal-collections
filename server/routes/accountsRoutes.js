import express from "express";
import validateObjectId from "../middleware/validateObjectId.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

import {
  seedMiddleware,
  getAccountingSettings,
  updateAccountingSettings,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getLedgers,
  createLedger,
  updateLedger,
  deleteLedger,
  getVouchers,
  getVoucher,
  postVoucher,
  putVoucher,
  removeVoucher,
} from "../controllers/accountsController.js";

const router = express.Router();

router.param("id", validateObjectId);

// The books are business financials: their own "accounts" permission, so a
// staff role can run orders/products without ever seeing them.
router.use(authMiddleware, adminMiddleware, requirePermission("accounts"), seedMiddleware);

router.get("/settings", getAccountingSettings);
router.put("/settings", updateAccountingSettings);

router.get("/groups", getGroups);
router.post("/groups", createGroup);
router.put("/groups/:id", updateGroup);
router.delete("/groups/:id", deleteGroup);

router.get("/ledgers", getLedgers);
router.post("/ledgers", createLedger);
router.put("/ledgers/:id", updateLedger);
router.delete("/ledgers/:id", deleteLedger);

router.get("/vouchers", getVouchers);
router.get("/vouchers/:id", getVoucher);
router.post("/vouchers", postVoucher);
router.put("/vouchers/:id", putVoucher);
router.delete("/vouchers/:id", removeVoucher);

export default router;
