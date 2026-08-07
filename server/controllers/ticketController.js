import Ticket from "../models/Ticket.js";
import SiteSettings from "../models/SiteSettings.js";
import { sendEmail } from "../config/mailer.js";

const notifyAdmin = async (ticket, latestMessage) => {
  try {
    const settings = await SiteSettings.findOne();

    if (!settings?.email) return;

    await sendEmail({
      to: settings.email,
      subject: `[Ticket #${ticket._id.toString().slice(-6)}] ${ticket.subject}`,
      html: `
        <p>${latestMessage.senderName} wrote:</p>
        <p>${latestMessage.message}</p>
        <p><a href="${process.env.CLIENT_URL}/admin/tickets">View in admin panel</a></p>
      `,
    });
  } catch (error) {
    console.error("Notify Admin (Ticket) Error:", error);
  }
};

const notifyCustomer = async (ticket, customerEmail, latestMessage) => {
  try {
    await sendEmail({
      to: customerEmail,
      subject: `New reply on your support ticket: ${ticket.subject}`,
      html: `
        <p>Hi,</p>
        <p>You have a new reply on your support ticket "${ticket.subject}":</p>
        <p style="padding:12px; background:#f8f9fa; border-radius:8px;">${latestMessage.message}</p>
        <p><a href="${process.env.CLIENT_URL}/tickets/${ticket._id}">View and reply</a></p>
      `,
    });
  } catch (error) {
    console.error("Notify Customer (Ticket) Error:", error);
  }
};

// ============================
// CREATE TICKET (Customer)
// ============================
export const createTicket = async (req, res) => {
  try {
    const { subject, message, order } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required",
      });
    }

    const ticket = await Ticket.create({
      user: req.user._id,
      subject: subject.trim(),
      order: order || null,
      messages: [
        {
          sender: "customer",
          senderName: req.user.name,
          message: message.trim(),
        },
      ],
      lastMessageAt: new Date(),
    });

    notifyAdmin(ticket, ticket.messages[0]).catch(() => {});

    res.status(201).json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error("Create Ticket Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET MY TICKETS (Customer)
// ============================
export const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ user: req.user._id })
      .select("-messages")
      .sort({ lastMessageAt: -1 });

    res.status(200).json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error("Get My Tickets Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL TICKETS (Admin)
// ============================
export const getAllTicketsAdmin = async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) filter.status = req.query.status;

    const tickets = await Ticket.find(filter)
      .select("-messages")
      .populate("user", "name email")
      .sort({ lastMessageAt: -1 });

    res.status(200).json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error("Get All Tickets Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET SINGLE TICKET (Customer who owns it, or Admin)
// ============================
export const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("user", "name email")
      .populate("order", "totalPrice orderStatus createdAt");

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const isOwner = ticket.user._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. This is not your ticket.",
      });
    }

    res.status(200).json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error("Get Ticket Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD MESSAGE (Customer who owns it, or Admin)
// ============================
export const addTicketMessage = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const ticket = await Ticket.findById(req.params.id).populate(
      "user",
      "name email",
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const isOwner = ticket.user._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. This is not your ticket.",
      });
    }

    const newMessage = {
      sender: isAdmin ? "admin" : "customer",
      senderName: req.user.name,
      message: message.trim(),
    };

    ticket.messages.push(newMessage);
    ticket.lastMessageAt = new Date();

    // A customer replying reopens a resolved/closed ticket; an admin
    // replying to a fresh ticket moves it into progress.
    if (isAdmin) {
      if (ticket.status === "Open") ticket.status = "In Progress";
      ticket.isSeenByAdmin = true;
    } else if (["Resolved", "Closed"].includes(ticket.status)) {
      ticket.status = "Open";
    }

    if (!isAdmin) ticket.isSeenByAdmin = false;

    await ticket.save();

    if (isAdmin) {
      notifyCustomer(ticket, ticket.user.email, newMessage).catch(() => {});
    } else {
      notifyAdmin(ticket, newMessage).catch(() => {});
    }

    res.status(200).json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error("Add Ticket Message Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE STATUS (Admin)
// ============================
export const updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["Open", "In Progress", "Resolved", "Closed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    res.status(200).json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error("Update Ticket Status Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// MARK SEEN (Admin)
// ============================
export const markTicketSeen = async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { isSeenByAdmin: true },
      { new: true },
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    res.status(200).json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error("Mark Ticket Seen Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
