import mongoose from "mongoose";

// One document per (notification kind, IST day) — e.g.
// "question-admin-email:2026-11-21" — counting how many of that kind of
// email have been ATTEMPTED that day. A slot is reserved atomically before
// the email is sent (utils/notificationBudget.js), so concurrent requests
// can never push the count past the day's limit. Kept in its own
// collection on purpose: unrelated to accounting's VoucherCounter.
const notificationBudgetSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0, min: 0 },
    // Old days are only history; Mongo's TTL monitor drops them.
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, timestamps: true },
);

notificationBudgetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const NotificationBudget = mongoose.model("NotificationBudget", notificationBudgetSchema);

export default NotificationBudget;
