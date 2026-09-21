import mongoose from "mongoose";
import Product from "../models/Product.js";
import User from "../models/User.js";
import OfflineSale from "../models/OfflineSale.js";
import {
  getLoyaltySettings,
  pointsEarnedFor,
  applyLoyaltyPointsChange,
} from "../utils/loyaltyPoints.js";

// GET /api/admin/pos/product/:id — what the QR code link resolves to.
export const getProductForPOS = async (req, res) => {
  try {
    // A reprinted/tampered QR label can encode an id that was never a
    // real ObjectId — without this check, Product.findById throws a
    // CastError that falls into the generic catch below as a 500
    // "Server Error" instead of the same graceful 404 a
    // valid-but-missing id already gets.
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const product = await Product.findById(req.params.id).select(
      "name image price stock variants isActive",
    );

    // A soft-deleted/discontinued product (deleteProduct only ever sets
    // isActive: false, stock is untouched) can still have its printed
    // shelf QR label around — that label permanently encodes this
    // product's id (ProductQRLabel.jsx), so without this check a scan
    // completes a sale for something the admin already pulled from sale.
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({ success: true, product });
  } catch (error) {
    console.error("Get Product For POS Error:", error);

    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /api/admin/pos/customer?mobile=XXXXXXXXXX
export const lookupCustomerByMobile = async (req, res) => {
  try {
    const { mobile } = req.query;

    if (!mobile) {
      return res.status(400).json({ success: false, message: "Mobile number is required" });
    }

    const customer = await User.findOne({ mobile, role: "user" }).select(
      "name mobile loyaltyPoints",
    );

    res.status(200).json({
      success: true,
      customer: customer || null,
    });
  } catch (error) {
    console.error("Lookup Customer Error:", error);

    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Atomic-ish stock reservation across every item in the cart — mirrors
// orderController's reserveStock/restoreStock: decrement each item, and if
// any one fails (not enough stock), roll back the ones already decremented
// rather than leaving a partial sale's worth of stock gone. For a variant
// item (item.size set), both the specific variant's stock AND the
// top-level stock (kept as a sum-of-variants rollup, see Product.js) are
// decremented in the same update — POS previously only ever touched
// top-level stock, which let a variant product be sold in-store without
// its specific size's stock ever changing (still oversellable online) and
// then have the deduction silently erased the next time the product was
// edited (updateProduct recomputes top-level stock from the variants sum).
const reserveStockForItems = async (items) => {
  const reserved = [];

  for (const item of items) {
    // isActive: true here (not just at the lookup step above) means a
    // sale can't complete for a since-deactivated product even if that
    // lookup was bypassed and a stale/known product id posted directly.
    const updated = item.size
      ? await Product.findOneAndUpdate(
          {
            _id: item.productId,
            isActive: true,
            stock: { $gte: item.quantity },
            variants: {
              $elemMatch: { size: item.size, stock: { $gte: item.quantity } },
            },
          },
          { $inc: { stock: -item.quantity, "variants.$[v].stock": -item.quantity } },
          { new: true, arrayFilters: [{ "v.size": item.size }] },
        )
      : await Product.findOneAndUpdate(
          { _id: item.productId, isActive: true, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true },
        );

    if (!updated) {
      await restoreStockForItems(
        reserved.map((r) => ({
          productId: r.product._id,
          quantity: r.quantity,
          size: r.size,
        })),
      );

      return { success: false, failedProductId: item.productId, product: null };
    }

    reserved.push({ product: updated, quantity: item.quantity, size: item.size || "" });
  }

  return { success: true, products: reserved.map((r) => r.product) };
};

// Reverses reserveStockForItems — shared by its own rollback-on-partial-
// failure path above and by recordOfflineSale below, when the sale itself
// can't be saved after stock has already been decremented for it.
const restoreStockForItems = async (items) => {
  for (const item of items) {
    if (item.size) {
      await Product.findOneAndUpdate(
        { _id: item.productId, "variants.size": item.size },
        { $inc: { stock: item.quantity, "variants.$[v].stock": item.quantity } },
        { arrayFilters: [{ "v.size": item.size }] },
      );
    } else {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity },
      });
    }
  }
};

// POST /api/admin/pos/sale
// body: { items: [{ productId, quantity, unitPrice, size? }], paymentMethod, customerMobile, customerName }
export const recordOfflineSale = async (req, res) => {
  try {
    const { paymentMethod, customerMobile, customerName } = req.body;

    let items;
    try {
      items =
        typeof req.body.items === "string"
          ? JSON.parse(req.body.items)
          : req.body.items;
    } catch {
      items = null;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // `!item.productId` alone only checks truthiness — an object like
    // {"$gt": ""} is truthy and would otherwise flow straight into the
    // Mongo query below (`_id: item.productId`) as a query operator
    // instead of a literal id to match, a NoSQL-injection path CodeQL
    // flags as "Database query built from user-controlled sources".
    // Building a brand-new array of plain objects here (instead of
    // mutating the original req.body items in place) is what lets
    // CodeQL's taint tracking actually see every value used in a query
    // below coming straight out of a `new ObjectId(...)`/Number() call
    // — mutating item.productId in place on the original array left it
    // unable to prove the reassignment happened before
    // reserveStockForItems read it back out of the same array.
    const safeItems = [];

    for (const item of items) {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);

      if (
        typeof item.productId !== "string" ||
        !mongoose.Types.ObjectId.isValid(item.productId) ||
        !qty ||
        qty < 1 ||
        !price ||
        price < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Each item needs a product, a valid quantity and price",
        });
      }

      safeItems.push({
        productId: new mongoose.Types.ObjectId(item.productId),
        quantity: qty,
        unitPrice: price,
        size: typeof item.size === "string" ? item.size : "",
      });
    }

    if (!["Cash", "UPI", "Card"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid payment method",
      });
    }

    const stockResult = await reserveStockForItems(safeItems);

    if (!stockResult.success) {
      const failedProduct = await Product.findById(
        stockResult.failedProductId,
      ).select("name stock isActive");

      let message = "One of the items is out of stock";
      if (failedProduct && !failedProduct.isActive) {
        message = `"${failedProduct.name}" is no longer available for sale`;
      } else if (failedProduct) {
        message = `Only ${failedProduct.stock} of "${failedProduct.name}" in stock`;
      }

      return res.status(400).json({
        success: false,
        message,
      });
    }

    const saleItems = safeItems.map((item, i) => {
      const product = stockResult.products[i];

      return {
        product: product._id,
        productName: product.name,
        size: item.size || "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      };
    });

    const subtotal = saleItems.reduce((sum, i) => sum + i.subtotal, 0);

    // Clamp so a mistyped discount can never push the total below 0 or
    // exceed the cart's own subtotal.
    const discountAmount = Math.min(
      Math.max(Number(req.body.discountAmount) || 0, 0),
      subtotal,
    );
    const totalAmount = subtotal - discountAmount;

    let customerUser = null;
    if (customerMobile) {
      customerUser = await User.findOne({
        mobile: customerMobile,
        role: "user",
      });
    }

    let loyaltyPointsAwarded = 0;
    if (customerUser) {
      const settings = await getLoyaltySettings();
      loyaltyPointsAwarded = pointsEarnedFor(totalAmount, settings.earnRate);
    }

    // The sale record is saved BEFORE loyalty points are actually credited
    // (applyLoyaltyPointsChange, a real write to the customer's balance) —
    // previously it was the other way round, so a failure saving the sale
    // (a DB blip, a validation edge case) left stock already decremented
    // and points already credited with no OfflineSale document to explain
    // either one. Saving the sale first means a failure here can still be
    // cleanly rolled back (stock restored, no points touched yet); a
    // failure crediting points *after* the sale is already recorded is the
    // lesser, recoverable inconsistency — the sale document itself still
    // shows exactly what was promised, for manual reconciliation.
    let sale;
    try {
      sale = await OfflineSale.create({
        items: saleItems,
        discountAmount,
        totalAmount,
        paymentMethod,
        customerMobile: customerMobile || "",
        customerName: customerUser?.name || customerName || "",
        customerUser: customerUser?._id || null,
        loyaltyPointsAwarded,
        soldBy: req.user._id,
        soldByMobile: req.user.mobile || "",
        paymentProofImage: req.file ? req.file.path : "",
      });
    } catch (saleError) {
      await restoreStockForItems(safeItems);
      throw saleError;
    }

    if (loyaltyPointsAwarded > 0) {
      await applyLoyaltyPointsChange({
        userId: customerUser._id,
        type: "earned",
        points: loyaltyPointsAwarded,
        description: "Earned on in-store purchase",
      });
    }

    res.status(201).json({
      success: true,
      message: "Sale recorded",
      sale,
    });
  } catch (error) {
    console.error("Record Offline Sale Error:", error);

    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /api/admin/pos/sales — recent offline sales log, for the admin to review.
export const getOfflineSales = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const [sales, total] = await Promise.all([
      OfflineSale.find()
        .populate("soldBy", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OfflineSale.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      sales,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get Offline Sales Error:", error);

    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// POST /api/admin/pos/sales/:id/void — undoes a completed in-store sale
// (mis-scanned item, customer walked away): restores stock and claws back
// any loyalty points awarded, same corrective actions a return already
// performs for an online order. The sale document itself is kept (not
// deleted) with a voided flag, as an audit trail of what happened.
export const voidOfflineSale = async (req, res) => {
  try {
    const sale = await OfflineSale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    // Atomic claim — the same double-click/two-tab race stockRestored on
    // ReturnRequest already guards against — stops two concurrent void
    // requests for the same sale from both restoring stock/clawing back
    // points.
    const claimed = await OfflineSale.findOneAndUpdate(
      { _id: sale._id, voided: false },
      { $set: { voided: true } },
    );

    if (!claimed) {
      return res.status(400).json({
        success: false,
        message: "This sale has already been voided",
      });
    }

    await restoreStockForItems(
      sale.items.map((item) => ({
        productId: item.product,
        quantity: item.quantity,
        size: item.size,
      })),
    );

    if (sale.loyaltyPointsAwarded > 0 && sale.customerUser) {
      await applyLoyaltyPointsChange({
        userId: sale.customerUser,
        type: "clawback",
        points: -sale.loyaltyPointsAwarded,
        description: `Reversed for voided in-store sale (${sale._id})`,
      });
    }

    sale.voided = true;
    sale.voidedAt = new Date();
    sale.voidedBy = req.user._id;
    sale.voidReason =
      typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    await sale.save();

    res.status(200).json({
      success: true,
      message: "Sale voided — stock restored",
      sale,
    });
  } catch (error) {
    console.error("Void Offline Sale Error:", error);

    res.status(500).json({ success: false, message: "Server Error" });
  }
};
