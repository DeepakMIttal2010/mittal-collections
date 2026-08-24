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
  restoreOrder,
  deleteOrder,
  permanentlyDeleteOrder,
  sendReviewRequestEmails,
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

// Send Review Request Emails — called by an external scheduler (cron
// secret, not JWT), registered before "/:id" so it isn't shadowed by it.
router.post("/send-review-requests", sendReviewRequestEmails);
router.get("/send-review-requests", sendReviewRequestEmails);

// Get Single Order — logged-in user (owner ya admin)
router.get("/:id", authMiddleware, getOrderById);

// Update Order Status — sirf Admin
router.put("/:id/status", authMiddleware, adminMiddleware, updateOrderStatus);

// Mark Order Seen — sirf Admin
router.put("/:id/seen", authMiddleware, adminMiddleware, markOrderSeen);

// Restore Order — sirf Admin
router.put("/:id/restore", authMiddleware, adminMiddleware, restoreOrder);

// Delete Order (soft) — sirf Admin
router.delete("/:id", authMiddleware, adminMiddleware, deleteOrder);

// Permanently Delete Order — sirf Admin
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  permanentlyDeleteOrder,
);

export default router;
