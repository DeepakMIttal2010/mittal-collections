import SiteSettings from "../models/SiteSettings.js";
import { invalidateBundleRulesCache } from "../utils/bundleDiscount.js";

// ============================
// GET SITE SETTINGS (Public)
// ============================
export const getSiteSettings = async (req, res) => {
  try {
    let settings = await SiteSettings.findOne().populate([
      { path: "bundleRules.categoryA", select: "name nameHi slug" },
      { path: "bundleRules.categoryB", select: "name nameHi slug" },
      { path: "pricingRules.category", select: "name nameHi slug" },
      { path: "pricingRules.subcategory", select: "name nameHi slug" },
    ]);

    if (!settings) {
      settings = await SiteSettings.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Get Site Settings Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE SITE SETTINGS (Admin)
// ============================
export const updateSiteSettings = async (req, res) => {
  try {
    const {
      facebook,
      instagram,
      twitter,
      linkedin,
      address,
      email,
      phone,
      supportHours,
      freeShippingThreshold,
      deliveryFee,
      codCharge,
      shippingTiers,
      defaultReturnPeriodDays,
      bundleRules,
      welcomePopupEnabled,
      pricingRules,
    } = req.body;

    // bundleRules/pricingRules feed straight into real pricing logic
    // (bundleDiscount.js, and the Cost/Price Auto-Fill suggestion
    // AddProduct/EditProduct use to fill purchasePrice -> price) with no
    // validation before this point — a self-referential bundle rule
    // (categoryA === categoryB) grants its discount to a single-category
    // cart with no actual second item, and a priceDiscountPercent >= 100
    // or a non-positive mrpMultiplier auto-fills a free or negative
    // product price that an admin can save without noticing.
    if (Array.isArray(bundleRules)) {
      const hasSelfReference = bundleRules.some(
        (rule) =>
          rule.categoryA &&
          rule.categoryB &&
          String(rule.categoryA) === String(rule.categoryB),
      );

      if (hasSelfReference) {
        return res.status(400).json({
          success: false,
          message: "A bundle rule's two categories must be different.",
        });
      }
    }

    if (Array.isArray(pricingRules)) {
      const hasInvalidRule = pricingRules.some(
        (rule) =>
          !(Number(rule.miscExpensesPercent) >= 0) ||
          !(Number(rule.mrpMultiplier) > 0) ||
          !(Number(rule.priceDiscountPercent) >= 0) ||
          Number(rule.priceDiscountPercent) >= 100,
      );

      if (hasInvalidRule) {
        return res.status(400).json({
          success: false,
          message:
            "Pricing rule values must be positive, with a discount percent under 100.",
        });
      }
    }

    // These four feed straight into calculateDeliveryFee (shipping.js) on
    // every single order — unlike bundleRules/pricingRules above, they had
    // no bounds check at all. A negative/NaN freeShippingThreshold makes
    // every order either always or never qualify for free shipping, and a
    // negative deliveryFee/tier fee/codCharge subtracts from the order
    // total instead of adding to it.
    if (
      (freeShippingThreshold !== undefined &&
        !(Number(freeShippingThreshold) >= 0)) ||
      (deliveryFee !== undefined && !(Number(deliveryFee) >= 0)) ||
      (codCharge !== undefined && !(Number(codCharge) >= 0)) ||
      (defaultReturnPeriodDays !== undefined &&
        !(Number(defaultReturnPeriodDays) > 0))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Shipping/return settings must be positive numbers.",
      });
    }

    if (Array.isArray(shippingTiers)) {
      const hasInvalidTier = shippingTiers.some(
        (tier) =>
          !(Number(tier.maxOrderValue) > 0) || !(Number(tier.fee) >= 0),
      );

      if (hasInvalidTier) {
        return res.status(400).json({
          success: false,
          message: "Each shipping tier needs a positive order value and a non-negative fee.",
        });
      }
    }

    let settings = await SiteSettings.findOne();

    if (!settings) {
      settings = new SiteSettings();
    }

    if (facebook !== undefined) settings.facebook = facebook;
    if (instagram !== undefined) settings.instagram = instagram;
    if (twitter !== undefined) settings.twitter = twitter;
    if (linkedin !== undefined) settings.linkedin = linkedin;
    if (address !== undefined) settings.address = address;
    if (email !== undefined) settings.email = email;
    if (phone !== undefined) settings.phone = phone;
    if (supportHours !== undefined) settings.supportHours = supportHours;
    if (freeShippingThreshold !== undefined)
      settings.freeShippingThreshold = freeShippingThreshold;
    if (deliveryFee !== undefined) settings.deliveryFee = deliveryFee;
    if (codCharge !== undefined) settings.codCharge = codCharge;
    if (shippingTiers !== undefined) settings.shippingTiers = shippingTiers;
    if (defaultReturnPeriodDays !== undefined)
      settings.defaultReturnPeriodDays = defaultReturnPeriodDays;
    if (bundleRules !== undefined) {
      settings.bundleRules = bundleRules;
      invalidateBundleRulesCache();
    }
    if (welcomePopupEnabled !== undefined)
      settings.welcomePopupEnabled = welcomePopupEnabled;
    if (pricingRules !== undefined) settings.pricingRules = pricingRules;

    await settings.save();
    await settings.populate([
      { path: "bundleRules.categoryA", select: "name nameHi slug" },
      { path: "bundleRules.categoryB", select: "name nameHi slug" },
      { path: "pricingRules.category", select: "name nameHi slug" },
      { path: "pricingRules.subcategory", select: "name nameHi slug" },
    ]);

    res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Update Site Settings Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
