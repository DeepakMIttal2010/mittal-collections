import mongoose from "mongoose";

// One batch of available loyalty points. Every credit (an order's earn
// once its return window has closed, a referral or review bonus, an
// in-store sale, an admin grant, a migrated legacy balance) becomes its
// own lot with its own 365-day expiry, so a new earning never extends an
// older one. Redemptions, clawbacks and expiry take points out of
// remainingPoints, earliest expiry first (see utils/loyaltyPoints.js).
//
// User.loyaltyPoints stays the spendable balance everything else reads;
// it always equals the sum of remainingPoints over this user's
// "available" lots plus any not-yet-migrated legacy balance.
const loyaltyLotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    source: {
      type: String,
      enum: ["order", "referral", "review", "pos", "admin", "legacy", "legacy_refund"],
      required: true,
    },

    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    review: { type: mongoose.Schema.Types.ObjectId, default: null },
    offlineSale: { type: mongoose.Schema.Types.ObjectId, ref: "OfflineSale", default: null },

    status: {
      type: String,
      enum: ["available", "expired"],
      default: "available",
    },

    originalPoints: { type: Number, required: true, min: 1 },
    remainingPoints: { type: Number, required: true, min: 0 },
    expiredPoints: { type: Number, default: 0, min: 0 },

    creditedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    expiredAt: { type: Date, default: null },

    // Idempotency key — the same credit can never create two lots.
    key: { type: String, required: true },

    description: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

loyaltyLotSchema.index({ key: 1 }, { unique: true });
// FEFO allocation and the customer's batch list.
loyaltyLotSchema.index({ user: 1, status: 1, expiresAt: 1 });
// Expiry job.
loyaltyLotSchema.index({ status: 1, expiresAt: 1 });

const LoyaltyLot = mongoose.model("LoyaltyLot", loyaltyLotSchema);

export default LoyaltyLot;
