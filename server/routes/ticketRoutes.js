import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

import {
  createTicket,
  getMyTickets,
  getAllTicketsAdmin,
  getTicketById,
  addTicketMessage,
  updateTicketStatus,
  markTicketSeen,
} from "../controllers/ticketController.js";

const router = express.Router();

router.post("/", authMiddleware, createTicket);
router.get("/my", authMiddleware, getMyTickets);
router.get("/admin", authMiddleware, adminMiddleware, getAllTicketsAdmin);
router.get("/:id", authMiddleware, getTicketById);
router.post("/:id/messages", authMiddleware, addTicketMessage);
router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  updateTicketStatus,
);
router.put("/:id/seen", authMiddleware, adminMiddleware, markTicketSeen);

export default router;
