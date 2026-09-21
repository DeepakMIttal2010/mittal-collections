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

// TTL index — auto-deletes alerts a year after they were created, same
// retention pattern as Notification.js. A subscriber's alert for a
// product that never restocks (or a product that gets discontinued)
// used to sit here forever with nothing to clean it up; a back-in-stock
// interest this old is no longer meaningful, and notified: true rows
// (already emailed) have no further purpose once sent anyway.
stockAlertSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);

const StockAlert = mongoose.model("StockAlert", stockAlertSchema);

export default StockAlert;
