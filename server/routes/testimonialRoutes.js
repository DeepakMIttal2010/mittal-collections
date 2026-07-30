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

const router = express.Router();

// Public — homepage testimonials section
router.get("/", getTestimonials);

// Admin-only
router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  getAllTestimonialsAdmin,
);
router.post("/", authMiddleware, adminMiddleware, addTestimonial);
router.put("/:id", authMiddleware, adminMiddleware, updateTestimonial);
router.delete("/:id", authMiddleware, adminMiddleware, deleteTestimonial);

export default router;
