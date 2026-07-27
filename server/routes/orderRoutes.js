import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/orderController.js";

const router = express.Router();

// Create Order
router.post("/", authMiddleware, createOrder);

// Get Logged In User Orders
router.get("/myorders", authMiddleware, getMyOrders);

// Get Single Order
router.get("/:id", authMiddleware, getOrderById);

// Update Order Status (Admin - we'll secure later)
router.put("/:id/status", authMiddleware, updateOrderStatus);

export default router;
