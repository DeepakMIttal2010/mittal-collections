import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

import {
  createOrder,
  verifyRazorpayPayment,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  markOrderSeen,
} from "../controllers/orderController.js";

const router = express.Router();

// Create Order — koi bhi logged-in user
router.post("/", authMiddleware, createOrder);

// Verify Razorpay Payment Signature — koi bhi logged-in user
router.post("/verify-payment", authMiddleware, verifyRazorpayPayment);

// Get Logged In User Orders — koi bhi logged-in user
router.get("/myorders", authMiddleware, getMyOrders);

// Get All Orders — sirf Admin
router.get("/", authMiddleware, adminMiddleware, getAllOrders);

// Get Single Order — logged-in user (owner ya admin)
router.get("/:id", authMiddleware, getOrderById);

// Update Order Status — sirf Admin
router.put("/:id/status", authMiddleware, adminMiddleware, updateOrderStatus);

// Mark Order Seen — sirf Admin
router.put("/:id/seen", authMiddleware, adminMiddleware, markOrderSeen);

export default router;
