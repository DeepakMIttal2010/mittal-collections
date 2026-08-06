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
      ],
      required: true,
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
  },
  {
    timestamps: true,
  },
);

loyaltyTransactionSchema.index({ user: 1, createdAt: -1 });

const LoyaltyTransaction = mongoose.model(
  "LoyaltyTransaction",
  loyaltyTransactionSchema,
);

export default LoyaltyTransaction;
