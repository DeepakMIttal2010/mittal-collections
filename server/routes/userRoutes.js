import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

import {
  getAllCustomers,
  getCustomerById,
  toggleBlockCustomer,
  deleteCustomer,
} from "../controllers/userController.js";

const router = express.Router();

// Sabhi routes admin-only hain
router.get("/", authMiddleware, adminMiddleware, getAllCustomers);
router.get("/:id", authMiddleware, adminMiddleware, getCustomerById);
router.put(
  "/:id/toggle-block",
  authMiddleware,
  adminMiddleware,
  toggleBlockCustomer,
);
router.delete("/:id", authMiddleware, adminMiddleware, deleteCustomer);

export default router;
