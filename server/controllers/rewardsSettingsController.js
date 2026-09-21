import SettingsChangeLog from "../models/SettingsChangeLog.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import {
  getLoyaltySettings,
  expireInactivePoints,
} from "../utils/loyaltyPoints.js";
import { getReferralSettings } from "../utils/referral.js";
import { REVIEW_BONUS_POINTS } from "./reviewController.js";

// Writes one log row per field that actually changed.
const logChanges = async (module, oldDoc, newFields, changedBy) => {
  const entries = Object.entries(newFields)
    .filter(([field, value]) => value !== undefined && oldDoc[field] !== value)
    .map(([field, value]) => ({
      module,
      field,
      oldValue: oldDoc[field],
      newValue: value,
      changedBy,
    }));

  if (entries.length > 0) {
    await SettingsChangeLog.insertMany(entries);
  }
};

// ============================
// GET REWARDS SETTINGS (Admin) — loyalty + referral + recent changes
// ============================
export const getRewardsSettings = async (req, res) => {
  try {
    const [loyalty, referral, changeLog] = await Promise.all([
      getLoyaltySettings(),
      getReferralSettings(),
      SettingsChangeLog.find().sort({ createdAt: -1 }).limit(50),
    ]);

    res.status(200).json({
      success: true,
      loyalty,
      referral,
      changeLog,
    });
  } catch (error) {
    console.error("Get Rewards Settings Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE LOYALTY SETTINGS (Admin)
// ============================
export const updateLoyaltySettings = async (req, res) => {
  try {
    const {
      earnRate,
      redeemValue,
      maxRedeemPercent,
      minRedeemPoints,
      expiryMonths,
    } = req.body;

    // earnRate/redeemValue are divisors elsewhere (pointsEarnedFor:
    // orderTotal/earnRate; maxRedeemablePoints: subtotal*percent/
    // redeemValue) — a 0 (or negative) value doesn't just misbehave, it
    // produces Infinity/NaN that gets written straight into a customer's
    // real loyaltyPoints balance on their next order, corrupting it for
    // every order after. The client form only sets a cosmetic HTML
    // `min` attribute, which a direct API call bypasses entirely.
    if (earnRate !== undefined && !(Number(earnRate) > 0)) {
      return res.status(400).json({
        success: false,
        message: "Earn rate must be a positive number.",
      });
    }
    if (redeemValue !== undefined && !(Number(redeemValue) > 0)) {
      return res.status(400).json({
        success: false,
        message: "Redeem value must be a positive number.",
      });
    }
    if (
      maxRedeemPercent !== undefined &&
      !(Number(maxRedeemPercent) >= 0 && Number(maxRedeemPercent) <= 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Max redeem percent must be between 0 and 1.",
      });
    }
    if (minRedeemPoints !== undefined && !(Number(minRedeemPoints) >= 0)) {
      return res.status(400).json({
        success: false,
        message: "Minimum redeem points can't be negative.",
      });
    }
    if (expiryMonths !== undefined && !(Number(expiryMonths) > 0)) {
      return res.status(400).json({
        success: false,
        message: "Expiry months must be a positive number.",
      });
    }

    const settings = await getLoyaltySettings();
    const changedBy = { id: req.user._id, name: req.user.name };

    await logChanges(
      "loyalty",
      settings.toObject(),
      { earnRate, redeemValue, maxRedeemPercent, minRedeemPoints, expiryMonths },
      changedBy,
    );

    if (earnRate !== undefined) settings.earnRate = earnRate;
    if (redeemValue !== undefined) settings.redeemValue = redeemValue;
    if (maxRedeemPercent !== undefined)
      settings.maxRedeemPercent = maxRedeemPercent;
    if (minRedeemPoints !== undefined)
      settings.minRedeemPoints = minRedeemPoints;
    if (expiryMonths !== undefined) settings.expiryMonths = expiryMonths;

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Loyalty settings updated",
      settings,
    });
  } catch (error) {
    console.error("Update Loyalty Settings Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE REFERRAL SETTINGS (Admin)
// ============================
export const updateReferralSettings = async (req, res) => {
  try {
    const { referrerPoints, referredPoints } = req.body;

    if (referrerPoints !== undefined && !(Number(referrerPoints) >= 0)) {
      return res.status(400).json({
        success: false,
        message: "Referrer points can't be negative.",
      });
    }
    if (referredPoints !== undefined && !(Number(referredPoints) >= 0)) {
      return res.status(400).json({
        success: false,
        message: "Referred points can't be negative.",
      });
    }

    const settings = await getReferralSettings();
    const changedBy = { id: req.user._id, name: req.user.name };

    await logChanges(
      "referral",
      settings.toObject(),
      { referrerPoints, referredPoints },
      changedBy,
    );

    if (referrerPoints !== undefined) settings.referrerPoints = referrerPoints;
    if (referredPoints !== undefined) settings.referredPoints = referredPoints;

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Referral settings updated",
      settings,
    });
  } catch (error) {
    console.error("Update Referral Settings Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// PUBLIC — just the numbers checkout/account pages need
// ============================
export const getPublicRewardsInfo = async (req, res) => {
  try {
    const [loyalty, referral] = await Promise.all([
      getLoyaltySettings(),
      getReferralSettings(),
    ]);

    res.status(200).json({
      success: true,
      loyalty: {
        earnRate: loyalty.earnRate,
        redeemValue: loyalty.redeemValue,
        maxRedeemPercent: loyalty.maxRedeemPercent,
        minRedeemPoints: loyalty.minRedeemPoints,
        expiryMonths: loyalty.expiryMonths,
      },
      referral: {
        referrerPoints: referral.referrerPoints,
        referredPoints: referral.referredPoints,
      },
      reviewBonusPoints: REVIEW_BONUS_POINTS,
    });
  } catch (error) {
    console.error("Get Public Rewards Info Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// EXPIRE INACTIVE POINTS — called by an external scheduler, protected
// by a shared secret rather than JWT auth (same pattern as the
// abandoned-cart-reminders cron endpoint).
// ============================
export const runPointsExpiry = async (req, res) => {
  try {

    const expiredCount = await expireInactivePoints();

    res.status(200).json({
      success: true,
      message: `Expired points for ${expiredCount} user(s)`,
      expiredCount,
    });
  } catch (error) {
    console.error("Run Points Expiry Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET MY LOYALTY TRANSACTIONS (Customer)
// ============================
export const getMyLoyaltyTransactions = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);

    const filter = { user: req.user._id };

    const total = await LoyaltyTransaction.countDocuments(filter);

    const transactions = await LoyaltyTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      transactions,
      total,
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error("Get My Loyalty Transactions Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
