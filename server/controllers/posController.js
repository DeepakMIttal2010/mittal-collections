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
    const product = await Product.findById(req.params.id).select(
      "name image price stock variants",
    );

    if (!product) {
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
    const updated = item.size
      ? await Product.findOneAndUpdate(
          {
            _id: item.productId,
            stock: { $gte: item.quantity },
            variants: {
              $elemMatch: { size: item.size, stock: { $gte: item.quantity } },
            },
          },
          { $inc: { stock: -item.quantity, "variants.$[v].stock": -item.quantity } },
          { new: true, arrayFilters: [{ "v.size": item.size }] },
        )
      : await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true },
        );

    if (!updated) {
      for (const r of reserved) {
        if (r.size) {
          await Product.findOneAndUpdate(
            { _id: r.product._id, "variants.size": r.size },
            { $inc: { stock: r.quantity, "variants.$[v].stock": r.quantity } },
            { arrayFilters: [{ "v.size": r.size }] },
          );
        } else {
          await Product.findByIdAndUpdate(r.product._id, {
            $inc: { stock: r.quantity },
          });
        }
      }

      return { success: false, failedProductId: item.productId, product: null };
    }

    reserved.push({ product: updated, quantity: item.quantity, size: item.size || "" });
  }

  return { success: true, products: reserved.map((r) => r.product) };
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

    for (const item of items) {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);

      if (!item.productId || !qty || qty < 1 || !price || price < 0) {
        return res.status(400).json({
          success: false,
          message: "Each item needs a product, a valid quantity and price",
        });
      }
    }

    if (!["Cash", "UPI", "Card"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid payment method",
      });
    }

    const stockResult = await reserveStockForItems(items);

    if (!stockResult.success) {
      const failedProduct = await Product.findById(
        stockResult.failedProductId,
      ).select("name stock");

      return res.status(400).json({
        success: false,
        message: failedProduct
          ? `Only ${failedProduct.stock} of "${failedProduct.name}" in stock`
          : "One of the items is out of stock",
      });
    }

    const saleItems = items.map((item, i) => {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);
      const product = stockResult.products[i];

      return {
        product: product._id,
        productName: product.name,
        size: item.size || "",
        quantity: qty,
        unitPrice: price,
        subtotal: qty * price,
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

      if (loyaltyPointsAwarded > 0) {
        await applyLoyaltyPointsChange({
          userId: customerUser._id,
          type: "earned",
          points: loyaltyPointsAwarded,
          description: "Earned on in-store purchase",
        });
      }
    }

    const sale = await OfflineSale.create({
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
