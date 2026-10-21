import mongoose from "mongoose";

// Atomic voucher-number counter, one document per "<PREFIX>/<FY>".
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});
export const VoucherCounter = mongoose.model("VoucherCounter", counterSchema);

// Singleton settings document (key "main").
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },

    // First day of the books (opening balances are as on this date).
    booksStartDate: { type: Date, required: true },

    // No voucher dated on or before this day can be created, edited or
    // voided -- the period is closed. null = nothing locked.
    lockedThrough: { type: Date, default: null },
  },
  { timestamps: true },
);
export const AccountingSettings = mongoose.model("AccountingSettings", settingsSchema);

// Append-only audit trail: who changed what, with the previous value.
const logSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
    details: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const AccountingLog = mongoose.model("AccountingLog", logSchema);
