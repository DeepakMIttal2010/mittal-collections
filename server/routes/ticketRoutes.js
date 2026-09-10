import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

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
const perm = requirePermission("tickets");

router.post("/", authMiddleware, createTicket);
router.get("/my", authMiddleware, getMyTickets);
router.get("/admin", authMiddleware, adminMiddleware, perm, getAllTicketsAdmin);
router.get("/:id", authMiddleware, getTicketById);
router.post("/:id/messages", authMiddleware, addTicketMessage);
router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  perm,
  updateTicketStatus,
);
router.put("/:id/seen", authMiddleware, adminMiddleware, perm, markTicketSeen);

export default router;
