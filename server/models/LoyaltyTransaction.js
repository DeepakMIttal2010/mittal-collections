import mongoose from "mongoose";

// A ledger entry for every loyalty-point change, so customers (and
// admins) can see a full history rather than just the current balance.
const loyaltyTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "earned",
        "redeemed",
        "refunded",
        "clawback",
        "referral_bonus",
        "admin_adjustment",
        "expired",
        // Part of a new credit used to settle User.loyaltyPointsOwed (a
        // clawback that found the points already spent).
        "debt_recovered",
      ],
      required: true,
    },

    // What the points were for. Older entries don't have it.
    source: {
      type: String,
      enum: ["order", "referral", "review", "pos", "admin", "legacy", "legacy_refund"],
    },

    points: {
      type: Number,
      required: true,
    },

    balanceAfter: {
      type: Number,
      required: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    description: {
      type: String,
      default: "",
    },

    // Everything below is written by the batch-based scheme (see
    // utils/loyaltyPoints.js); entries from before it have none of it.

    // Idempotency key — a retried or overlapping write of the same
    // change hits the unique index instead of applying twice.
    key: { type: String },

    // The lot a credit created, or the lot an expiry emptied.
    lot: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltyLot", default: undefined },

    // Which lots a deduction took points from (lot: null = a legacy
    // balance not yet split into lots), so a later refund can put them
    // back exactly where they came from.
    allocations: {
      type: [
        new mongoose.Schema(
          {
            lot: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltyLot", default: null },
            points: Number,
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },

    // Expiry of the lot a credit created.
    expiresAt: Date,

    // Points a clawback could not take because they were already spent;
    // added to User.loyaltyPointsOwed instead.
    shortfall: Number,

    review: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    offlineSale: { type: mongoose.Schema.Types.ObjectId, ref: "OfflineSale", default: undefined },
    returnRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ReturnRequest", default: undefined },

    // The admin behind a manual adjustment.
    actor: {
      type: new mongoose.Schema(
        { id: mongoose.Schema.Types.ObjectId, name: String },
        { _id: false },
      ),
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

loyaltyTransactionSchema.index({ user: 1, createdAt: -1 });
loyaltyTransactionSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { key: { $type: "string" } } },
);
// Refunds look up the redemption entries of one order.
loyaltyTransactionSchema.index({ order: 1, type: 1 });

const LoyaltyTransaction = mongoose.model(
  "LoyaltyTransaction",
  loyaltyTransactionSchema,
);

export default LoyaltyTransaction;
