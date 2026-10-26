import express from "express";
import validateObjectId from "../middleware/validateObjectId.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";
import requireWriteAccess from "../middleware/requireWriteAccess.js";
import requireCronSecret from "../middleware/requireCronSecret.js";

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
  cancelStaleRazorpayOrders,
  resendOrderStatusEmail,
  resumeRazorpayPayment,
  convertOrderToCod,
  resolvePaymentReview,
} from "../controllers/orderController.js";
import { getOrderCost, setOrderCost } from "../controllers/orderCostController.js";

const router = express.Router();

router.param("id", validateObjectId);
const perm = requirePermission("orders");
const canModify = requireWriteAccess("orders", "modified");

// Create Order — koi bhi logged-in user
router.post("/", authMiddleware, createOrder);

// Verify Razorpay Payment Signature — koi bhi logged-in user
router.post("/verify-payment", authMiddleware, verifyRazorpayPayment);

// Get Logged In User Orders — koi bhi logged-in user
router.get("/myorders", authMiddleware, getMyOrders);

// Get All Orders — sirf Admin
router.get("/", authMiddleware, adminMiddleware, perm, getAllOrders);

// Send Review Request Emails — called by an external scheduler (cron
// secret, not JWT), registered before "/:id" so it isn't shadowed by it.
router.post("/send-review-requests", requireCronSecret, sendReviewRequestEmails);
router.get("/send-review-requests", requireCronSecret, sendReviewRequestEmails);

// Pending Razorpay payments (reminders, auto-cancel, late-payment checks)
// — called by an external scheduler (cron secret, not JWT), same
// registration-order reasoning as above. /cancel-stale-razorpay is the
// URL the existing cron-job.org job uses; /process-pending-payments is the
// same handler under its current name.
router.post("/cancel-stale-razorpay", requireCronSecret, cancelStaleRazorpayOrders);
router.get("/cancel-stale-razorpay", requireCronSecret, cancelStaleRazorpayOrders);
router.post("/process-pending-payments", requireCronSecret, cancelStaleRazorpayOrders);
router.get("/process-pending-payments", requireCronSecret, cancelStaleRazorpayOrders);

// Get Single Order — logged-in user (owner ya admin)
router.get("/:id", authMiddleware, getOrderById);

// Resume a stalled/failed Razorpay Payment — koi bhi logged-in user
// (owner-checked inside the controller), re-opens the same Razorpay
// order rather than creating a new one.
router.post("/:id/resume-payment", authMiddleware, resumeRazorpayPayment);

// Order cost snapshot + courier charge -- internal profit data, so gated
// by the "reports" permission (not just "orders"): a staff account that
// can manage orders but not see financials must not read purchase prices.
const costPerm = requirePermission("reports");
router.get("/:id/cost", authMiddleware, adminMiddleware, costPerm, getOrderCost);
router.put("/:id/cost", authMiddleware, adminMiddleware, costPerm, canModify, setOrderCost);

// Update Order Status — sirf Admin
router.put("/:id/status", authMiddleware, adminMiddleware, perm, canModify, updateOrderStatus);

// Convert a cancelled, unpaid Razorpay order to COD — sirf Admin
router.put("/:id/convert-to-cod", authMiddleware, adminMiddleware, perm, canModify, convertOrderToCod);

// Close a payment review after checking the Razorpay dashboard — sirf Admin
router.put(
  "/:id/payment-review/resolve",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  resolvePaymentReview,
);

// Resend Order Status Notification Email — sirf Admin (no data changes,
// gated same as a status update since it does send a real customer email)
router.post(
  "/:id/resend-status-email",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  resendOrderStatusEmail,
);

// Mark Order Seen — sirf Admin (a lightweight read-marker like the
// notification bell, not gated by write access — see adminRoutes.js's
// notifications routes for the same reasoning)
router.put("/:id/seen", authMiddleware, adminMiddleware, perm, markOrderSeen);

// Restore Order — sirf Admin
router.put("/:id/restore", authMiddleware, adminMiddleware, perm, canModify, restoreOrder);

// Delete Order (soft) — sirf Admin
router.delete("/:id", authMiddleware, adminMiddleware, perm, canModify, deleteOrder);

// Permanently Delete Order — sirf Admin
router.delete(
  "/:id/permanent",
  authMiddleware,
  adminMiddleware,
  perm,
  canModify,
  permanentlyDeleteOrder,
);

export default router;
