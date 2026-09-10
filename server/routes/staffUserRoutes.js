import express from "express";

import {
  getStaffUsers,
  addStaffUser,
  updateStaffUser,
  deleteStaffUser,
} from "../controllers/staffUserController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.get("/", authMiddleware, adminMiddleware, requirePermission("staff-users"), getStaffUsers);
router.post("/", authMiddleware, adminMiddleware, requirePermission("staff-users"), addStaffUser);
router.put("/:id", authMiddleware, adminMiddleware, requirePermission("staff-users"), updateStaffUser);
router.delete("/:id", authMiddleware, adminMiddleware, requirePermission("staff-users"), deleteStaffUser);

export default router;
