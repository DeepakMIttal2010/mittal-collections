import mongoose from "mongoose";

import { VOUCHER_TYPES } from "../config/accountingDefaults.js";

// One accounting voucher: a dated set of Dr/Cr lines that must balance.
// A single document, so it is saved atomically -- there is never a state
// where half of a voucher exists. Balance (sum Dr = sum Cr) is enforced in
// utils/accounting.js before insert AND by the pre-validate hook here, so
// no code path that goes through Mongoose can store an unbalanced voucher.
const voucherSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.keys(VOUCHER_TYPES), required: true },

    // e.g. "PAY/2026-27/0007" -- per type, per financial year.
    number: { type: String, required: true },
    fy: { type: String, required: true },
    seq: { type: Number, required: true },

    // Noon IST of the voucher's calendar day.
    date: { type: Date, required: true, index: true },

    narration: { type: String, default: "", trim: true, maxlength: 500 },

    entries: {
      type: [
        {
          ledger: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
          side: { type: String, enum: ["Dr", "Cr"], required: true },
          amountPaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
        },
      ],
      validate: [(v) => v.length >= 2, "A voucher needs at least two lines"],
    },

    totalPaise: { type: Number, required: true, min: 1 },

    // Later PRs: the order/expense/etc. an auto-generated voucher came from.
    // Null for hand-entered vouchers (the only ones editable by hand).
    source: {
      kind: { type: String, default: undefined },
      id: { type: String, default: undefined },
      // Hash of the figures the voucher was built from -- lets the sync
      // tell "unchanged" from "the order/expense was edited, rebuild it".
      hash: { type: String, default: undefined },
    },

    // A deleted voucher is kept (audit trail) but voided: excluded from
    // every balance and report.
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date, default: undefined },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
  },
  { timestamps: true },
);

voucherSchema.pre("validate", function checkBalance() {
  const dr = this.entries.filter((e) => e.side === "Dr").reduce((s, e) => s + e.amountPaise, 0);
  const cr = this.entries.filter((e) => e.side === "Cr").reduce((s, e) => s + e.amountPaise, 0);

  if (dr !== cr) {
    this.invalidate("entries", `Voucher does not balance (Dr ${dr} paise vs Cr ${cr} paise)`);
  } else if (this.totalPaise !== dr) {
    this.invalidate("totalPaise", "totalPaise must equal the debit total");
  }
});

voucherSchema.index({ type: 1, fy: 1, seq: 1 }, { unique: true });
voucherSchema.index({ "entries.ledger": 1, date: 1 });
// Plain (non-partial) index for the lookup by source: the partial unique
// index below can't serve an equality query, so without this every lookup
// scanned the whole collection.
voucherSchema.index({ "source.kind": 1, "source.id": 1, voided: 1 });
// One live voucher per source document -- what makes auto-posting idempotent.
voucherSchema.index(
  { "source.kind": 1, "source.id": 1 },
  { unique: true, partialFilterExpression: { "source.kind": { $type: "string" }, voided: false } },
);

const Voucher = mongoose.model("Voucher", voucherSchema);

export default Voucher;
