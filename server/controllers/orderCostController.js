import Order from "../models/Order.js";
import OrderCost from "../models/OrderCost.js";
import { syncOrder, postSafely } from "../utils/accountingPosting.js";

const MAX_AMOUNT = 1000000;

const isValidAmount = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;

const round2 = (n) => Math.round(n * 100) / 100;

// Admin-only shape: the stored snapshot plus the derived totals, so the
// client never has to repeat this arithmetic.
const shapeCost = (cost) => {
  const productCost = round2(
    cost.items.reduce((sum, i) => sum + i.quantity * i.unitPurchasePrice, 0),
  );
  const miscCost = round2(
    cost.items.reduce((sum, i) => sum + i.quantity * i.unitMiscExpenses, 0),
  );

  return {
    items: cost.items,
    productCost,
    miscCost,
    courierCharge: cost.courierCharge,
    courierNote: cost.courierNote,
    updatedAt: cost.updatedAt,
  };
};

// ============================
// Get an order's cost snapshot (Admin, "reports" permission)
// ============================
export const getOrderCost = async (req, res) => {
  try {
    const cost = await OrderCost.findOne({ order: req.params.id }).lean();

    res.status(200).json({
      success: true,
      cost: cost ? shapeCost(cost) : null,
    });
  } catch (error) {
    console.error("Get Order Cost Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================
// Set courier charge / note (Admin)
// ============================
// Also the one-time backfill path for an order placed before cost
// snapshots existed: when no OrderCost record exists yet, `itemCosts`
// (aligned by index with the order's items) is required and is stored
// via $setOnInsert -- so it can never overwrite a snapshot that
// createOrder already took, even if two requests race.
export const setOrderCost = async (req, res) => {
  try {
    const { courierCharge, courierNote, itemCosts } = req.body;

    if (courierCharge !== null && courierCharge !== undefined && !isValidAmount(courierCharge)) {
      return res.status(400).json({
        success: false,
        message: "Courier charge must be a number between 0 and 1,000,000.",
      });
    }

    if (courierNote !== undefined && (typeof courierNote !== "string" || courierNote.length > 200)) {
      return res.status(400).json({
        success: false,
        message: "Courier note must be text up to 200 characters.",
      });
    }

    const order = await Order.findById(req.params.id).select("orderItems").lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const update = { $set: {} };

    if (courierCharge !== undefined) update.$set.courierCharge = courierCharge;
    if (courierNote !== undefined) update.$set.courierNote = courierNote.trim();

    const exists = await OrderCost.exists({ order: order._id });

    if (!exists) {
      const valid =
        Array.isArray(itemCosts) &&
        itemCosts.length === order.orderItems.length &&
        itemCosts.every(
          (c) => c && isValidAmount(c.unitPurchasePrice) && isValidAmount(c.unitMiscExpenses),
        );

      if (!valid) {
        return res.status(400).json({
          success: false,
          message:
            "This order has no cost snapshot yet. Send itemCosts: one { unitPurchasePrice, unitMiscExpenses } per order item.",
        });
      }

      update.$setOnInsert = {
        items: order.orderItems.map((item, i) => ({
          product: item.product,
          size: item.size || "",
          quantity: item.quantity,
          unitPurchasePrice: itemCosts[i].unitPurchasePrice,
          unitMiscExpenses: itemCosts[i].unitMiscExpenses,
        })),
      };
    }

    if (Object.keys(update.$set).length === 0) delete update.$set;

    if (!update.$set && !update.$setOnInsert) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    const cost = await OrderCost.findOneAndUpdate({ order: order._id }, update, {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
    }).lean();

    // Courier charge / backfilled costs change what the books should say.
    await postSafely(syncOrder, order._id);

    res.status(200).json({ success: true, cost: shapeCost(cost) });
  } catch (error) {
    console.error("Set Order Cost Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
