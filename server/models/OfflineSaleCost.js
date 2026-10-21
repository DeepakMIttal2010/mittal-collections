import mongoose from "mongoose";

// Cost snapshot of a POS (in-store) sale, kept in its OWN collection --
// same reasoning as OrderCost: sale documents are listed to every staff
// account with the "pos" permission, who must not thereby see purchase
// prices. Read only by the accounting module (utils/accountingPosting.js).
// Taken when the sale is recorded and refreshed when the sale is edited.
const offlineSaleCostSchema = new mongoose.Schema(
  {
    sale: { type: mongoose.Schema.Types.ObjectId, ref: "OfflineSale", required: true, unique: true },

    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        size: { type: String, default: "" },
        quantity: { type: Number, required: true, min: 1 },
        unitPurchasePrice: { type: Number, default: 0, min: 0 },
        unitMiscExpenses: { type: Number, default: 0, min: 0 },
      },
    ],
  },
  { timestamps: true },
);

const OfflineSaleCost = mongoose.model("OfflineSaleCost", offlineSaleCostSchema);

export default OfflineSaleCost;
