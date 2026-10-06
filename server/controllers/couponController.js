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

    const effectiveType = discountType || "percentage";

    // calculateDiscount only ever clamps a negative discount into being
    // MORE negative (Math.min(discount, maxDiscount/subtotal) — the
    // min of two negatives is still negative), which orderController.js
    // then subtracts from the order total, increasing it — a coupon
    // with a negative value or maxDiscount would silently overcharge
    // every customer who applies it, with nothing catching it before
    // save. A percentage over 100 is separately just a no-op typo trap
    // (calculateDiscount already caps at the order subtotal), but still
    // worth catching here rather than leaving the admin no warning.
    if (
      !["percentage", "flat"].includes(effectiveType) ||
      !(Number(discountValue) > 0) ||
      (effectiveType === "percentage" && Number(discountValue) > 100) ||
      (maxDiscount !== undefined &&
        maxDiscount !== null &&
        maxDiscount !== "" &&
        !(Number(maxDiscount) >= 0))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid discount value (0-100 for a percentage coupon, above 0 for a flat one) and a non-negative max discount",
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

    const effectiveType =
      discountType !== undefined ? discountType : coupon.discountType;
    const effectiveValue =
      discountValue !== undefined ? discountValue : coupon.discountValue;
    const effectiveMaxDiscount =
      maxDiscount !== undefined ? maxDiscount || null : coupon.maxDiscount;

    // Same reasoning as addCoupon — validated against the FINAL
    // effective values (existing + this request's overrides), since an
    // update might only touch one field but leave the resulting
    // combination invalid (e.g. switching type to "percentage" without
    // also lowering an existing flat discountValue of 500).
    if (
      !["percentage", "flat"].includes(effectiveType) ||
      !(Number(effectiveValue) > 0) ||
      (effectiveType === "percentage" && Number(effectiveValue) > 100) ||
      (effectiveMaxDiscount !== null && !(Number(effectiveMaxDiscount) >= 0))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid discount value (0-100 for a percentage coupon, above 0 for a flat one) and a non-negative max discount",
      });
    }

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
