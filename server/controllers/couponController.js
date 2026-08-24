import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";

const calculateDiscount = (coupon, subtotal) => {
  let discount =
    coupon.discountType === "flat"
      ? coupon.discountValue
      : (subtotal * coupon.discountValue) / 100;

  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);

  return Math.round(discount);
};

const isEligibleForFirstOrderCoupon = async (userId) => {
  // A Cancelled order was never a completed purchase — most commonly an
  // admin cancelling a customer's very first order — so it shouldn't
  // permanently burn their one-time welcome-coupon eligibility.
  const priorOrders = await Order.countDocuments({
    user: userId,
    orderStatus: { $ne: "Cancelled" },
  });
  return priorOrders === 0;
};

// ============================
// GET BANNER COUPON (Public)
// ============================
export const getBannerCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({
      isActive: true,
      showAsBanner: true,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      coupon,
    });
  } catch (error) {
    console.error("Get Banner Coupon Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET FIRST-ORDER OFFER (Logged-in user)
// ============================
export const getFirstOrderOffer = async (req, res) => {
  try {
    const eligible = await isEligibleForFirstOrderCoupon(req.user._id);

    if (!eligible) {
      return res.status(200).json({ success: true, coupon: null });
    }

    const coupon = await Coupon.findOne({
      isActive: true,
      firstOrderOnly: true,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      coupon,
    });
  } catch (error) {
    console.error("Get First Order Offer Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// VALIDATE COUPON (Logged-in user)
// ============================
export const validateCoupon = async (req, res) => {
  try {
    const { code, subtotal } = req.body;

    if (!code || subtotal === undefined) {
      return res.status(400).json({
        success: false,
        message: "Coupon code and subtotal are required",
      });
    }

    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired coupon code",
      });
    }

    if (coupon.firstOrderOnly) {
      const eligible = await isEligibleForFirstOrderCoupon(req.user._id);

      if (!eligible) {
        return res.status(400).json({
          success: false,
          message: "This coupon is valid on your first order only",
        });
      }
    }

    const discountAmount = calculateDiscount(coupon, subtotal);

    res.status(200).json({
      success: true,
      code: coupon.code,
      discountAmount,
      description: coupon.description,
    });
  } catch (error) {
    console.error("Validate Coupon Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL COUPONS (Admin)
// ============================
export const getAllCouponsAdmin = async (req, res) => {
  try {
    const allowedSortFields = ["code", "discountValue", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const coupons = await Coupon.find().sort({ [sortBy]: sortOrder });

    res.status(200).json({
      success: true,
      coupons,
    });
  } catch (error) {
    console.error("Get Coupons Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD COUPON (Admin)
// ============================
export const addCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      maxDiscount,
      firstOrderOnly,
      description,
      showAsBanner,
      isActive,
    } = req.body;

    if (!code || discountValue === undefined) {
      return res.status(400).json({
        success: false,
        message: "Code and discount value are required",
      });
    }

    const existing = await Coupon.findOne({ code: code.trim().toUpperCase() });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A coupon with this code already exists",
      });
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      discountType: discountType || "percentage",
      discountValue,
      maxDiscount: maxDiscount || null,
      firstOrderOnly: firstOrderOnly === undefined ? false : firstOrderOnly,
      description: description || "",
      showAsBanner: showAsBanner === undefined ? false : showAsBanner,
      isActive: isActive === undefined ? true : isActive,
    });

    res.status(201).json({
      success: true,
      message: "Coupon added successfully",
      coupon,
    });
  } catch (error) {
    console.error("Add Coupon Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE COUPON (Admin)
// ============================
export const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    const {
      discountType,
      discountValue,
      maxDiscount,
      firstOrderOnly,
      description,
      showAsBanner,
      isActive,
    } = req.body;

    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = discountValue;
    if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount || null;
    if (firstOrderOnly !== undefined) coupon.firstOrderOnly = firstOrderOnly;
    if (description !== undefined) coupon.description = description;
    if (showAsBanner !== undefined) coupon.showAsBanner = showAsBanner;
    if (isActive !== undefined) coupon.isActive = isActive;

    await coupon.save();

    res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    console.error("Update Coupon Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE COUPON (Admin — soft delete)
// ============================
export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("Delete Coupon Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// RESTORE COUPON (Admin)
// ============================
export const restoreCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true },
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Coupon restored successfully",
      coupon,
    });
  } catch (error) {
    console.error("Restore Coupon Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

export { calculateDiscount, isEligibleForFirstOrderCoupon };
