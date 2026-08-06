import SettingsChangeLog from "../models/SettingsChangeLog.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { getLoyaltySettings } from "../utils/loyaltyPoints.js";
import { getReferralSettings } from "../utils/referral.js";

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
    const { earnRate, redeemValue, maxRedeemPercent, minRedeemPoints } =
      req.body;

    const settings = await getLoyaltySettings();
    const changedBy = { id: req.user._id, name: req.user.name };

    await logChanges(
      "loyalty",
      settings.toObject(),
      { earnRate, redeemValue, maxRedeemPercent, minRedeemPoints },
      changedBy,
    );

    if (earnRate !== undefined) settings.earnRate = earnRate;
    if (redeemValue !== undefined) settings.redeemValue = redeemValue;
    if (maxRedeemPercent !== undefined)
      settings.maxRedeemPercent = maxRedeemPercent;
    if (minRedeemPoints !== undefined)
      settings.minRedeemPoints = minRedeemPoints;

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
      },
      referral: {
        referrerPoints: referral.referrerPoints,
        referredPoints: referral.referredPoints,
      },
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
