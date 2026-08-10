// Loyalty points scheme, now admin-configurable via LoyaltySettings
// instead of hardcoded constants. Earn rate applies only on delivery
// (never on cancelled/returned orders); redemption is capped so points
// can't fully zero out an order.

import User from "../models/User.js";
import LoyaltySettings from "../models/LoyaltySettings.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "./notify.js";

const DEFAULTS = {
  earnRate: 20,
  redeemValue: 1,
  maxRedeemPercent: 0.5,
  minRedeemPoints: 50,
  expiryMonths: 12,
};

// Returns the single settings doc, creating it with defaults on first use.
export const getLoyaltySettings = async () => {
  let settings = await LoyaltySettings.findOne();
  if (!settings) settings = await LoyaltySettings.create(DEFAULTS);
  return settings;
};

export const pointsEarnedFor = (orderTotal, earnRate) =>
  Math.floor(orderTotal / earnRate);

export const maxRedeemablePoints = (subtotal, availablePoints, settings) => {
  const capByOrder = Math.floor(
    (subtotal * settings.maxRedeemPercent) / settings.redeemValue,
  );
  return Math.max(0, Math.min(availablePoints, capByOrder));
};

// Applies a loyalty point change to a user's balance and records it in
// the ledger in one place, so every code path stays consistent and the
// running balance is always accurate. `points` may be negative.
export const applyLoyaltyPointsChange = async ({
  userId,
  type,
  points,
  order = null,
  description = "",
}) => {
  if (!points) return null;

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { loyaltyPoints: points } },
    { new: true },
  );

  if (!user) return null;

  await LoyaltyTransaction.create({
    user: userId,
    type,
    points,
    balanceAfter: user.loyaltyPoints,
    order,
    description,
  });

  return user;
};

// Expires the full remaining balance for any user whose most recent
// positive-points activity (earned, referral bonus, refund, or a
// credit-type manual adjustment — anything that added points, not
// just the two "earned via order" types) is older than the configured
// expiryMonths — the common "use it or lose it" loyalty program rule.
// Returns how many users were affected.
export const expireInactivePoints = async () => {
  const settings = await getLoyaltySettings();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - settings.expiryMonths);

  const usersWithPoints = await User.find({ loyaltyPoints: { $gt: 0 } }).select(
    "name email loyaltyPoints",
  );

  let expiredCount = 0;

  for (const user of usersWithPoints) {
    const lastEarn = await LoyaltyTransaction.findOne({
      user: user._id,
      points: { $gt: 0 },
    }).sort({ createdAt: -1 });

    const lastEarnDate = lastEarn?.createdAt;
    const isStale = !lastEarnDate || lastEarnDate < cutoff;

    if (!isStale) continue;

    const pointsToExpire = user.loyaltyPoints;

    await applyLoyaltyPointsChange({
      userId: user._id,
      type: "expired",
      points: -pointsToExpire,
      description: `${pointsToExpire} points expired after ${settings.expiryMonths} months of inactivity`,
    });

    expiredCount += 1;

    notifyUser({
      userId: user._id,
      type: "loyalty_points",
      title: "Your loyalty points have expired",
      message: `${pointsToExpire} points expired after ${settings.expiryMonths} months of inactivity`,
      link: "/account",
    });

    if (user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: "Your loyalty points have expired",
          html: `
            <p>Hi ${user.name || "there"},</p>
            <p>${pointsToExpire} loyalty points on your Mittal Collections account expired due to
            ${settings.expiryMonths} months of inactivity. Shop again to start earning fresh points!</p>
          `,
        });
      } catch (error) {
        console.error(`Points expiry email failed for ${user.email}:`, error);
      }
    }
  }

  return expiredCount;
};
