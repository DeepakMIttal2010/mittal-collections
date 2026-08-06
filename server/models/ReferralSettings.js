import mongoose from "mongoose";

// Singleton document — there is only ever one of these.
const referralSettingsSchema = new mongoose.Schema(
  {
    referrerPoints: { type: Number, default: 100 }, // paid to the person who referred
    referredPoints: { type: Number, default: 50 }, // paid to the new customer
  },
  {
    timestamps: true,
  },
);

const ReferralSettings = mongoose.model(
  "ReferralSettings",
  referralSettingsSchema,
);

export default ReferralSettings;
