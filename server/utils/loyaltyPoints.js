// Simple loyalty points scheme: earn 1 point per ₹20 spent (credited only
// after delivery, to avoid rewarding cancelled/returned orders), redeemable
// 1 point = ₹1 off, capped so points can't fully zero out an order.

export const EARN_RATE = 20; // ₹ spent per point earned
export const REDEEM_VALUE = 1; // ₹ discount per point redeemed
export const MAX_REDEEM_PERCENT = 0.5; // can't cover more than 50% of subtotal
export const MIN_REDEEM_POINTS = 50; // must hold at least this many to redeem

export const pointsEarnedFor = (orderTotal) =>
  Math.floor(orderTotal / EARN_RATE);

export const maxRedeemablePoints = (subtotal, availablePoints) => {
  const capByOrder = Math.floor((subtotal * MAX_REDEEM_PERCENT) / REDEEM_VALUE);
  return Math.max(0, Math.min(availablePoints, capByOrder));
};
