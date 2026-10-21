import mongoose from "mongoose";

// Internal cost accounting for one order, kept in its OWN collection on
// purpose rather than as extra fields on Order.orderItems: the Order
// document is returned as-is to the customer by getMyOrders/getOrderById/
// createOrder/verifyPayment (and more), so any cost field added there
// would leak the shop's purchase prices to every buyer. Only the
// admin-only endpoints in orderCostController.js ever read this model.
//
// Costs are a SNAPSHOT taken when the order is placed (createOrder), so a
// later change to a product's purchasePrice/miscExpenses never rewrites
// the profit of orders that were already sold.
const orderCostSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },

    // Same order and length as Order.orderItems.
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        size: { type: String, default: "" },
        quantity: { type: Number, required: true, min: 1 },
        // Per unit. A variant item uses that variant's own purchasePrice;
        // miscExpenses only exists at product level.
        unitPurchasePrice: { type: Number, default: 0, min: 0 },
        unitMiscExpenses: { type: Number, default: 0, min: 0 },
      },
    ],

    // What the courier actually charged the shop for this parcel. null =
    // not entered yet (distinct from a real 0, e.g. self-delivery).
    courierCharge: { type: Number, default: null, min: 0 },

    courierNote: { type: String, default: "", trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

const OrderCost = mongoose.model("OrderCost", orderCostSchema);

export default OrderCost;
