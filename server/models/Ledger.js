import mongoose from "mongoose";

// An account (ledger). All money in the accounting module is stored as
// INTEGER PAISE, never rupees-as-floats, so sums and the Dr = Cr check are
// exact (0.1 + 0.2 style drift would otherwise unbalance a voucher).
const ledgerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    nameKey: { type: String, required: true, unique: true },

    group: { type: mongoose.Schema.Types.ObjectId, ref: "AccountGroup", required: true, index: true },

    // Opening balance on the books-start date.
    openingPaise: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    openingSide: { type: String, enum: ["Dr", "Cr"], default: "Dr" },

    // Set only on ledgers later PRs auto-post to; found by key so renaming
    // the ledger never breaks posting. Such ledgers cannot be deleted or
    // moved to another group.
    systemKey: { type: String, default: undefined },

    isActive: { type: Boolean, default: true },

    notes: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

ledgerSchema.index({ systemKey: 1 }, { unique: true, partialFilterExpression: { systemKey: { $type: "string" } } });

const Ledger = mongoose.model("Ledger", ledgerSchema);

export default Ledger;
