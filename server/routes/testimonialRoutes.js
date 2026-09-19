import express from "express";

import {
  getTestimonials,
  getAllTestimonialsAdmin,
  addTestimonial,
  updateTestimonial,
  deleteTestimonial,
} from "../controllers/testimonialController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("testimonials");

// Public — homepage testimonials section
router.get("/", getTestimonials);

// Admin-only
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  perm,
  getAllTestimonialsAdmin,
);
router.post("/", authMiddleware, adminMiddleware, perm, addTestimonial);
router.put("/:id", authMiddleware, adminMiddleware, perm, updateTestimonial);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteTestimonial);

export default router;
