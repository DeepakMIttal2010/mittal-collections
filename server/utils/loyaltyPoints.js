// Loyalty points scheme, now admin-configurable via LoyaltySettings
// instead of hardcoded constants. Earn rate applies only on delivery
// (never on cancelled/returned orders); redemption is capped so points
// can't fully zero out an order.

import User from "../models/User.js";
import LoyaltySettings from "../models/LoyaltySettings.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";

const DEFAULTS = {
  earnRate: 20,
  redeemValue: 1,
  maxRedeemPercent: 0.5,
  minRedeemPoints: 50,
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
