import mongoose from "mongoose";

// Singleton document — there is only ever one of these.
const loyaltySettingsSchema = new mongoose.Schema(
  {
    earnRate: { type: Number, default: 20 }, // ₹ spent per point earned
    redeemValue: { type: Number, default: 1 }, // ₹ discount per point redeemed
    maxRedeemPercent: { type: Number, default: 0.1 }, // cap as a fraction of the merchandise subtotal after discounts
    // No longer used: redemption has no minimum and every lot expires 365
    // days after its own credit date (see utils/loyaltyPoints.js). Kept so
    // existing documents and the settings change log still read cleanly.
    minRedeemPoints: { type: Number, default: 0 },
    expiryMonths: { type: Number, default: 12 },
  },
  {
    timestamps: true,
  },
);

const LoyaltySettings = mongoose.model("LoyaltySettings", loyaltySettingsSchema);

export default LoyaltySettings;
