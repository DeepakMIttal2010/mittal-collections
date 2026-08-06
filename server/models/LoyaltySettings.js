import mongoose from "mongoose";

// Singleton document — there is only ever one of these.
const loyaltySettingsSchema = new mongoose.Schema(
  {
    earnRate: { type: Number, default: 20 }, // ₹ spent per point earned
    redeemValue: { type: Number, default: 1 }, // ₹ discount per point redeemed
    maxRedeemPercent: { type: Number, default: 0.5 }, // cap as a fraction of subtotal
    minRedeemPoints: { type: Number, default: 50 }, // must hold at least this many to redeem
    expiryMonths: { type: Number, default: 12 }, // balance expires after this many months of no new earning
  },
  {
    timestamps: true,
  },
);

const LoyaltySettings = mongoose.model("LoyaltySettings", loyaltySettingsSchema);

export default LoyaltySettings;
