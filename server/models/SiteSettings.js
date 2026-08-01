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
    deliveryFee: { type: Number, default: 49 },
  },
  {
    timestamps: true,
  },
);

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);

export default SiteSettings;
