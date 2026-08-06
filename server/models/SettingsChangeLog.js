import mongoose from "mongoose";

// Audit trail for admin-editable reward settings (loyalty points rate,
// referral bonus amounts, etc.) — one row per field changed.
const settingsChangeLogSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      enum: ["loyalty", "referral"],
      required: true,
    },

    field: {
      type: String,
      required: true,
    },

    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,

    changedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
    },
  },
  {
    timestamps: true,
  },
);

const SettingsChangeLog = mongoose.model(
  "SettingsChangeLog",
  settingsChangeLogSchema,
);

export default SettingsChangeLog;
