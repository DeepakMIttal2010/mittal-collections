import mongoose from "mongoose";

// In-app notifications shown to a customer inside the site (bell icon +
// /notifications page) — a lighter-weight companion to the email sent for
// the same event, not a replacement for it.
const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "order_status",
        "ticket_reply",
        "return_status",
        "back_in_stock",
        "loyalty_points",
        "price_drop",
        "account_status",
        "question_answered",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      default: "",
    },

    link: {
      type: String,
      default: "",
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

// TTL index — auto-deletes notifications older than 1 year, same
// retention/reasoning as PageVisit and SearchLog: this collection had
// no cleanup at all and every notifyUser() call (order status, ticket
// replies, returns, loyalty points, etc.) grows it with no cap. A
// customer has no use for an in-app notification this old (the linked
// order/ticket/etc. has long since been resolved), and the emailed
// copy sent alongside every one of these remains in their own inbox
// regardless.
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
