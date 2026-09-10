import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

import {
  createReturnRequest,
  getMyReturnRequests,
  getAllReturnRequestsAdmin,
  updateReturnStatus,
  markReturnSeen,
} from "../controllers/returnController.js";

const router = express.Router();
const perm = requirePermission("returns");

router.post("/", authMiddleware, createReturnRequest);
router.get("/my", authMiddleware, getMyReturnRequests);
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllReturnRequestsAdmin);
router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  perm,
  updateReturnStatus,
);
router.put("/:id/seen", authMiddleware, adminMiddleware, perm, markReturnSeen);

export default router;
