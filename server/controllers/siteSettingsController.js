import SiteSettings from "../models/SiteSettings.js";
import { invalidateBundleRulesCache } from "../utils/bundleDiscount.js";

// ============================
// GET SITE SETTINGS (Public)
// ============================
export const getSiteSettings = async (req, res) => {
  try {
    let settings = await SiteSettings.findOne().populate([
      { path: "bundleRules.categoryA", select: "name slug" },
      { path: "bundleRules.categoryB", select: "name slug" },
      { path: "pricingRules.category", select: "name slug" },
      { path: "pricingRules.subcategory", select: "name slug" },
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
      { path: "bundleRules.categoryA", select: "name slug" },
      { path: "bundleRules.categoryB", select: "name slug" },
      { path: "pricingRules.category", select: "name slug" },
      { path: "pricingRules.subcategory", select: "name slug" },
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
