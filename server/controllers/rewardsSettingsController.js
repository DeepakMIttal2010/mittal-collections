import SettingsChangeLog from "../models/SettingsChangeLog.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import {
  getLoyaltySettings,
  creditDueOrderPoints,
  expireDueLots,
  getLoyaltySummary,
  LOT_VALIDITY_DAYS,
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
    // minRedeemPoints and expiryMonths are no longer settable: redemption
    // has no minimum, and every batch of points expires LOT_VALIDITY_DAYS
    // after its own credit date. Older admin clients may still send them;
    // they're ignored.
    const { earnRate, redeemValue, maxRedeemPercent } = req.body;

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

    const settings = await getLoyaltySettings();
    const changedBy = { id: req.user._id, name: req.user.name };

    await logChanges(
      "loyalty",
      settings.toObject(),
      { earnRate, redeemValue, maxRedeemPercent },
      changedBy,
    );

    if (earnRate !== undefined) settings.earnRate = earnRate;
    if (redeemValue !== undefined) settings.redeemValue = redeemValue;
    if (maxRedeemPercent !== undefined)
      settings.maxRedeemPercent = maxRedeemPercent;

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
        // Redemption has no minimum any more; still sent (as 0) for
        // clients built before that change.
        minRedeemPoints: 0,
        pointsValidityDays: LOT_VALIDITY_DAYS,
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
// LOYALTY CRON — called by an external scheduler, protected by a shared
// secret rather than JWT auth (same pattern as the abandoned-cart-reminders
// cron endpoint). Kept on the old /expire-points URL so the existing
// schedule keeps working: first credits delivered orders whose return
// window has closed, then expires batches past their 365 days. Both are
// safe to run repeatedly or overlapping.
// ============================
export const runPointsExpiry = async (req, res) => {
  try {
    const now = new Date();
    const credit = await creditDueOrderPoints({ now });
    const expiry = await expireDueLots({ now });

    console.log("[loyalty] cron:", JSON.stringify({ credit, expiry }));

    res.status(200).json({
      success: true,
      message: `Credited ${credit.credited} order(s), expired ${expiry.expiredLots} batch(es)`,
      credit,
      expiry,
    });
  } catch (error) {
    console.error("Run Loyalty Cron Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET MY LOYALTY SUMMARY (Customer) — available vs pending, batches and
// their expiry dates
// ============================
export const getMyLoyaltySummary = async (req, res) => {
  try {
    const summary = await getLoyaltySummary(req.user._id);

    res.status(200).json({ success: true, summary });
  } catch (error) {
    console.error("Get My Loyalty Summary Error:", error);

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
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const filter = { user: req.user._id };

    const total = await LoyaltyTransaction.countDocuments(filter);

    // Which admin made an adjustment, the idempotency key and the
    // lot-allocation detail are internal — the customer sees the change,
    // its reason and the expiry of what was credited.
    const transactions = await LoyaltyTransaction.find(filter)
      .select("-actor -key -allocations")
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
