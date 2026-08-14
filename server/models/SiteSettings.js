import mongoose from "mongoose";

const siteSettingsSchema = new mongoose.Schema(
  {
    facebook: { type: String, default: "", trim: true },
    instagram: { type: String, default: "", trim: true },
    twitter: { type: String, default: "", trim: true },
    linkedin: { type: String, default: "", trim: true },

    address: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    supportHours: { type: String, default: "", trim: true },

    freeShippingThreshold: { type: Number, default: 499 },
    deliveryFee: { type: Number, default: 49 }, // fallback fee below any tier and below the free threshold

    // Graduated fee below freeShippingThreshold — e.g. order < ₹99 pays ₹49,
    // < ₹199 pays ₹39, and so on, nudging customers toward free shipping.
    shippingTiers: [
      {
        maxOrderValue: { type: Number, required: true },
        fee: { type: Number, required: true },
      },
    ],

    // Default return window (days from delivery) for any product that
    // doesn't set its own returnPeriodDays override.
    defaultReturnPeriodDays: { type: Number, default: 7 },

    // "Complete the Look" bundle discounts — buying from both categories in
    // a rule unlocks that rule's discount automatically at checkout, no
    // coupon needed. Admin-managed (see AdminSettings.jsx).
    bundleRules: [
      {
        categoryA: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
          required: true,
        },
        categoryB: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
          required: true,
        },
        discountPercent: { type: Number, required: true },
        isActive: { type: Boolean, default: true },
      },
    ],

    // Toggles the first-visit "Welcome to Mittal Collections" benefits
    // popup shown to guests (see WelcomeBenefitsPopup.jsx).
    welcomePopupEnabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);

export default SiteSettings;
