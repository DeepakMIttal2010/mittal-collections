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

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
