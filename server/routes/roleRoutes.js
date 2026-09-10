import express from "express";

import { getRoles, addRole, updateRole, deleteRole } from "../controllers/roleController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.get("/", authMiddleware, adminMiddleware, requirePermission("roles"), getRoles);
router.post("/", authMiddleware, adminMiddleware, requirePermission("roles"), addRole);
router.put("/:id", authMiddleware, adminMiddleware, requirePermission("roles"), updateRole);
router.delete("/:id", authMiddleware, adminMiddleware, requirePermission("roles"), deleteRole);

export default router;
