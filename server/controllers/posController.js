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
      "name image price stock",
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

// POST /api/admin/pos/sale
export const recordOfflineSale = async (req, res) => {
  try {
    const {
      productId,
      quantity,
      unitPrice,
      paymentMethod,
      customerMobile,
      customerName,
    } = req.body;

    const qty = Number(quantity);
    const price = Number(unitPrice);

    if (!productId || !qty || qty < 1 || !price || price < 0) {
      return res.status(400).json({
        success: false,
        message: "Product, a valid quantity and price are required",
      });
    }

    if (!["Cash", "UPI", "Card"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid payment method",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} in stock`,
      });
    }

    product.stock -= qty;
    await product.save();

    const totalAmount = qty * price;

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
          description: `Earned on in-store purchase of ${product.name}`,
        });
      }
    }

    const sale = await OfflineSale.create({
      product: product._id,
      productName: product.name,
      quantity: qty,
      unitPrice: price,
      totalAmount,
      paymentMethod,
      customerMobile: customerMobile || "",
      customerName: customerUser?.name || customerName || "",
      customerUser: customerUser?._id || null,
      loyaltyPointsAwarded,
      soldBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Sale recorded",
      sale,
      remainingStock: product.stock,
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
