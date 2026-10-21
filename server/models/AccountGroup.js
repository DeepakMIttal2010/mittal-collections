import mongoose from "mongoose";

// A Tally-style account group. Primary groups have no parent; a sub-group
// inherits nature + section from its parent when created.
const accountGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },

    // Lower-cased name -- unique, so "Marketing" and "marketing" can't both exist.
    nameKey: { type: String, required: true, unique: true },

    parent: { type: mongoose.Schema.Types.ObjectId, ref: "AccountGroup", default: null },

    nature: { type: String, enum: ["Asset", "Liability", "Income", "Expense"], required: true },

    section: { type: String, enum: ["trading", "profit-loss", "balance-sheet"], required: true },

    // Tally's own groups: locked (cannot be renamed, moved or deleted).
    isPredefined: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const AccountGroup = mongoose.model("AccountGroup", accountGroupSchema);

export default AccountGroup;
