import express from "express";

import { getDashboardData } from "../controllers/adminController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Sabhi admin routes: pehle login check, phir admin-role check
router.get("/dashboard", authMiddleware, adminMiddleware, getDashboardData);

export default router;
