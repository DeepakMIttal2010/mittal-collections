import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

import {
  createReturnRequest,
  getMyReturnRequests,
  getAllReturnRequestsAdmin,
  updateReturnStatus,
} from "../controllers/returnController.js";

const router = express.Router();

router.post("/", authMiddleware, createReturnRequest);
router.get("/my", authMiddleware, getMyReturnRequests);
router.get("/admin", authMiddleware, adminMiddleware, getAllReturnRequestsAdmin);
router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  updateReturnStatus,
);

export default router;
