import mongoose from "mongoose";

const stockAlertSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    notified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

stockAlertSchema.index({ product: 1, email: 1 }, { unique: true });

const StockAlert = mongoose.model("StockAlert", stockAlertSchema);

export default StockAlert;
