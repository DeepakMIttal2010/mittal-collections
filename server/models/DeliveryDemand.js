import mongoose from "mongoose";

// Demand from PINs we can't deliver to yet (PR-B2). One row per
// visitor + PIN + IST day + source (+ product for product-page checks),
// so "unique visitors" is a plain distinct count and repeat checks only
// bump `attempts`. Measures interest for the GST-registration decision;
// it is never an order and never revenue.
//
// visitorKey is "u:<userId>" for a logged-in customer or "v:<sha256 of
// the anonymous visitorId>" for a guest — the raw visitorId is never
// stored. `user` is set for every logged-in row (so deleting a customer
// removes all their rows), but the admin report shows a name/phone only
// for customers who reached checkout with a cart.
const demandItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    size: String,
    quantity: Number,
    unitPrice: Number,
    // purchasePrice + miscExpenses at the time of the check; 0 when the
    // product has no purchase price recorded (see costIncomplete).
    unitCost: Number,
  },
  { _id: false },
);

const deliveryDemandSchema = new mongoose.Schema({
  visitorKey: { type: String, required: true },

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // YYYY-MM-DD in Asia/Kolkata.
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

  pincode: { type: String, required: true, match: /^\d{6}$/ },

  // Empty when the PIN couldn't be verified (India Post down / unknown).
  state: { type: String, default: "", trim: true },
  district: { type: String, default: "", trim: true },

  reason: {
    type: String,
    enum: ["not_serviceable", "unverified", "ambiguous"],
    required: true,
  },

  source: {
    type: String,
    enum: ["product", "header", "checkout"],
    required: true,
  },

  // Product-page checks only.
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  productName: { type: String, default: "" },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },

  // Checkout checks only: the latest cart seen that day, priced server-side.
  items: { type: [demandItemSchema], default: undefined },
  cartValue: { type: Number, default: 0 },
  cartCost: { type: Number, default: 0 },
  costIncomplete: { type: Boolean, default: false },
  // Review fix H2: over the line/quantity limits or the value threshold.
  // Kept and shown, but left out of the main Potential Value totals.
  outlier: { type: Boolean, default: false },
  outlierReasons: { type: [String], default: undefined },

  attempts: { type: Number, default: 1 },
  firstAt: { type: Date, required: true },
  lastAt: { type: Date, required: true },
});

deliveryDemandSchema.index(
  { visitorKey: 1, pincode: 1, day: 1, source: 1, product: 1 },
  { unique: true },
);
deliveryDemandSchema.index({ user: 1 });

// TTL: rows go about 365 days after the visitor's last check. The report
// also never looks back further than 365 days.
deliveryDemandSchema.index({ lastAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

const DeliveryDemand = mongoose.model("DeliveryDemand", deliveryDemandSchema);

export default DeliveryDemand;
