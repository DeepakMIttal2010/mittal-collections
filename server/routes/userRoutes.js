import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

import {
  getAllCustomers,
  getCustomerById,
  toggleBlockCustomer,
  deleteCustomer,
  adjustLoyaltyPoints,
} from "../controllers/userController.js";

const router = express.Router();
const perm = requirePermission("customers");

// Sabhi routes admin-only hain
router.get("/", authMiddleware, adminMiddleware, perm, getAllCustomers);
router.get("/:id", authMiddleware, adminMiddleware, perm, getCustomerById);
router.put(
  "/:id/toggle-block",
  authMiddleware,
  adminMiddleware,
  perm,
  toggleBlockCustomer,
);
router.put(
  "/:id/loyalty-adjust",
  authMiddleware,
  adminMiddleware,
  perm,
  adjustLoyaltyPoints,
);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteCustomer);

export default router;
