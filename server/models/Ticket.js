import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    // Where the ticket came from: a customer opening one themselves, or a
    // "No, I didn't receive it safely" delivery-feedback answer (see
    // deliveryFeedbackController.js). Tickets from before this field
    // existed read as "customer".
    source: {
      type: String,
      enum: ["customer", "delivery_feedback"],
      default: "customer",
    },

    status: {
      type: String,
      enum: ["Open", "In Progress", "Resolved", "Closed"],
      default: "Open",
    },

    messages: [
      {
        sender: {
          type: String,
          enum: ["customer", "admin"],
          required: true,
        },
        senderName: {
          type: String,
          required: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    isSeenByAdmin: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

ticketSchema.index({ user: 1, lastMessageAt: -1 });
ticketSchema.index({ status: 1, lastMessageAt: -1 });
// Admin notification poll's unseen-tickets query.
ticketSchema.index({ isSeenByAdmin: 1, lastMessageAt: -1 });
// At most one delivery-feedback ticket per order, enforced by the database
// — a retried or doubled request can't open a second one. Partial, so
// ordinary customer tickets (any number per order) are unaffected, and no
// existing ticket matches it.
ticketSchema.index(
  { order: 1 },
  { unique: true, partialFilterExpression: { source: "delivery_feedback" } },
);

const Ticket = mongoose.model("Ticket", ticketSchema);

export default Ticket;
