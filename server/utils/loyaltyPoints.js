// Loyalty points scheme (admin-configurable rates via LoyaltySettings).
//
// - Earn: 1 point per earnRate rupees of merchandise, after coupon, bundle
//   and points discounts — never on delivery or COD charges. An order's
//   points stay pending until its return window has closed with no return
//   still open (see creditDueOrderPoints); pending points can't be spent.
// - Redeem: from 1 point, worth redeemValue rupees each, capped at
//   maxRedeemPercent of the merchandise subtotal after discounts.
// - Expiry: every credit is its own lot (models/LoyaltyLot.js) valid for
//   LOT_VALIDITY_DAYS after its own credit date; spending and clawbacks
//   take from the lot that expires first. Only a lot's unspent remainder
//   ever expires.
//
// Every balance change goes through this file. Each one updates the user's
// balance, the lots and the ledger together inside one MongoDB transaction
// (the caller's, when it passes `session`), and carries an idempotency key
// so a retried or overlapping run can't apply the same change twice.
// Emails and notifications are never sent from inside a transaction — the
// functions that need them return what happened and notify after commit.

import User from "../models/User.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ReturnRequest from "../models/ReturnRequest.js";
import SiteSettings from "../models/SiteSettings.js";
import LoyaltySettings from "../models/LoyaltySettings.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "./notify.js";
import { escapeHtml } from "./escapeHtml.js";
import { withOptionalTransaction } from "./orderTransactions.js";
import { getReferralSettings } from "./referral.js";

const DEFAULTS = {
  earnRate: 20,
  redeemValue: 1,
  maxRedeemPercent: 0.1,
  minRedeemPoints: 0,
  expiryMonths: 12,
};

export const LOT_VALIDITY_DAYS = 365;

// A return request in one of these states can still take points back, so
// an order's pending points wait for it to be settled.
const OPEN_RETURN_STATUSES = ["Requested", "Approved", "Picked Up"];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export class LoyaltyConflictError extends Error {
  constructor(message = "Loyalty balance changed during the update") {
    super(message);
    this.code = "LOYALTY_CONFLICT";
  }
}

// Returns the single settings doc, creating it with defaults on first use.
export const getLoyaltySettings = async () => {
  let settings = await LoyaltySettings.findOne();
  if (!settings) settings = await LoyaltySettings.create(DEFAULTS);
  return settings;
};

export const pointsEarnedFor = (amount, earnRate) =>
  amount > 0 ? Math.floor(amount / earnRate) : 0;

export const maxRedeemablePoints = (eligibleSubtotal, availablePoints, settings) => {
  const capByOrder = Math.floor(
    (eligibleSubtotal * settings.maxRedeemPercent) / settings.redeemValue,
  );
  return Math.max(0, Math.min(availablePoints, capByOrder));
};

// A lot is valid through the end of the India Standard Time calendar day
// LOT_VALIDITY_DAYS after the day it was credited: credited any time on
// 26 Oct 2026 IST -> valid until 26 Oct 2027 23:59:59.999 IST. It counts
// as expired from expiresAt onwards (expiresAt <= now).
export const lotExpiryFor = (creditedAt) => {
  const ist = new Date(new Date(creditedAt).getTime() + IST_OFFSET_MS);
  const targetDayUtc = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + LOT_VALIDITY_DAYS,
  );
  return new Date(targetDayUtc + DAY_MS - 1 - IST_OFFSET_MS);
};

// Merchandise value an order earns on: items after coupon, bundle and
// points discounts. Delivery and COD charges are never part of it.
export const eligibleEarnBase = (order) => {
  const subtotal = (order.orderItems || []).reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
    0,
  );
  return Math.max(
    0,
    subtotal -
      (order.discountAmount || 0) -
      (order.bundleDiscountAmount || 0) -
      (order.pointsDiscount || 0),
  );
};

// When a delivered order's points stop being at risk from a return: the
// latest return deadline among its returnable items, worked out exactly
// the way createReturnRequest checks a return (deliveredAt + the product's
// own returnPeriodDays, else the site default). An order with nothing
// returnable is due straight away.
export const pointsAvailableAtFor = async (order, deliveredAt) => {
  const [settings, products] = await Promise.all([
    SiteSettings.findOne().select("defaultReturnPeriodDays"),
    Product.find({ _id: { $in: order.orderItems.map((item) => item.product) } }).select(
      "isReturnable returnPeriodDays",
    ),
  ]);
  const defaultDays = settings?.defaultReturnPeriodDays ?? 7;
  const productById = new Map(products.map((p) => [String(p._id), p]));

  let days = 0;
  for (const item of order.orderItems) {
    const product = productById.get(String(item.product));
    // A product deleted since is treated as returnable — the safer side.
    if (product && product.isReturnable === false) continue;
    days = Math.max(days, product?.returnPeriodDays || defaultDays);
  }

  const availableAt = new Date(deliveredAt);
  availableAt.setDate(availableAt.getDate() + days);
  return availableAt;
};

// Runs fn inside the caller's transaction when one is passed, otherwise in
// a transaction of its own. A duplicate idempotency key that slipped past
// the in-transaction check (two runs racing the very same change) means
// the change already happened.
const runLoyaltyWrite = async (session, fn) => {
  if (session) return fn(session);

  try {
    return await withOptionalTransaction(fn);
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    throw error;
  }
};

const alreadyApplied = (key, session) =>
  LoyaltyTransaction.exists({ key }).session(session);

const writeLedger = async (session, entry) => {
  const [doc] = await LoyaltyTransaction.create([entry], { session });
  return doc;
};

// The user's lots and how much of the balance is spendable right now. Any
// part of the balance not covered by lots is a legacy balance from before
// the lot scheme (until the migration splits it into lots) — it has no
// expiry of its own and is spent first, since it predates every lot.
const loadBalanceState = async (userId, session, now) => {
  const user = await User.findById(userId)
    .select("name email loyaltyPoints loyaltyPointsOwed")
    .session(session);

  if (!user) return null;

  const lots = await LoyaltyLot.find({
    user: userId,
    status: "available",
    remainingPoints: { $gt: 0 },
  })
    .sort({ expiresAt: 1, creditedAt: 1, _id: 1 })
    .session(session);

  const lotTotal = lots.reduce((sum, lot) => sum + lot.remainingPoints, 0);
  const liveLots = lots.filter((lot) => lot.expiresAt > now);
  const unbatched = Math.max(0, user.loyaltyPoints - lotTotal);
  const spendable = unbatched + liveLots.reduce((sum, lot) => sum + lot.remainingPoints, 0);

  return { user, liveLots, unbatched, spendable };
};

// Points the customer can redeem now: excludes pending points (never in
// the balance) and lots past their expiry the expiry job hasn't reached.
export const getSpendablePoints = async (userId, now = new Date()) => {
  const state = await loadBalanceState(userId, null, now);
  return state ? state.spendable : 0;
};

// Takes `points` out of the user's lots — preferred lots first (a
// clawback reverses the order's own lot before touching anything else),
// then the legacy balance, then earliest expiry first — and off the
// balance. Each lot update is conditional on the lot still holding what
// was read, so a concurrent spend/expiry aborts this one instead of
// double-spending.
const takePoints = async (session, state, points, preferLotIds, now) => {
  const preferred = preferLotIds.map(String);
  const ordered = [
    ...state.liveLots.filter((lot) => preferred.includes(String(lot._id))),
    { unbatched: true, remainingPoints: state.unbatched },
    ...state.liveLots.filter((lot) => !preferred.includes(String(lot._id))),
  ];

  const allocations = [];
  let left = points;

  for (const source of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, source.remainingPoints);
    if (take <= 0) continue;

    if (!source.unbatched) {
      const updated = await LoyaltyLot.updateOne(
        {
          _id: source._id,
          status: "available",
          remainingPoints: { $gte: take },
          expiresAt: { $gt: now },
        },
        { $inc: { remainingPoints: -take } },
        { session },
      );

      if (updated.modifiedCount !== 1) throw new LoyaltyConflictError();
    }

    allocations.push({ lot: source.unbatched ? null : source._id, points: take });
    left -= take;
  }

  if (left > 0) throw new LoyaltyConflictError();

  const user = await User.findOneAndUpdate(
    { _id: state.user._id, loyaltyPoints: { $gte: points } },
    { $inc: { loyaltyPoints: -points } },
    { new: true, session },
  );

  if (!user) throw new LoyaltyConflictError();

  return { user, allocations };
};

const creditPoints = async (session, change, now) => {
  const user = await User.findById(change.userId).select("loyaltyPointsOwed").session(session);
  if (!user) return null;

  const expiresAt = change.expiresAt || lotExpiryFor(now);
  const settle = Math.min(user.loyaltyPointsOwed || 0, change.points);

  const [lot] = await LoyaltyLot.create(
    [
      {
        user: change.userId,
        source: change.source,
        order: change.order || null,
        review: change.review || null,
        offlineSale: change.offlineSale || null,
        originalPoints: change.points,
        remainingPoints: change.points - settle,
        creditedAt: now,
        expiresAt,
        key: change.key,
        description: change.description || "",
      },
    ],
    { session },
  );

  let updated = await User.findByIdAndUpdate(
    change.userId,
    { $inc: { loyaltyPoints: change.points } },
    { new: true, session },
  );

  await writeLedger(session, {
    user: change.userId,
    type: change.type,
    source: change.source,
    points: change.points,
    balanceAfter: updated.loyaltyPoints,
    order: change.order || null,
    review: change.review,
    offlineSale: change.offlineSale,
    returnRequest: change.returnRequest,
    actor: change.actor,
    description: change.description || "",
    key: change.key,
    lot: lot._id,
    expiresAt,
  });

  // Points owed from an earlier clawback come out of the new credit first.
  if (settle > 0) {
    updated = await User.findByIdAndUpdate(
      change.userId,
      { $inc: { loyaltyPoints: -settle, loyaltyPointsOwed: -settle } },
      { new: true, session },
    );

    await writeLedger(session, {
      user: change.userId,
      type: "debt_recovered",
      source: change.source,
      points: -settle,
      balanceAfter: updated.loyaltyPoints,
      order: change.order || null,
      description: `${settle} points settled against points owed from an earlier return or cancellation`,
      key: `${change.key}:owed`,
      allocations: [{ lot: lot._id, points: settle }],
    });
  }

  return { user: updated, lot, settled: settle };
};

const debitPoints = async (session, change, now) => {
  const state = await loadBalanceState(change.userId, session, now);
  if (!state) return null;

  const wanted = -change.points;

  // A redemption or admin deduction needs the full amount; a clawback
  // takes what is there and records the rest as owed.
  if (!change.allowShortfall && state.spendable < wanted) return null;

  const taken = Math.min(wanted, state.spendable);
  const shortfall = wanted - taken;

  let user = state.user;
  let allocations = [];

  if (taken > 0) {
    ({ user, allocations } = await takePoints(
      session,
      state,
      taken,
      change.preferLotIds || [],
      now,
    ));
  }

  if (shortfall > 0) {
    user = await User.findByIdAndUpdate(
      change.userId,
      { $inc: { loyaltyPointsOwed: shortfall } },
      { new: true, session },
    );
  }

  await writeLedger(session, {
    user: change.userId,
    type: change.type,
    source: change.source,
    points: taken ? -taken : 0,
    balanceAfter: user.loyaltyPoints,
    order: change.order || null,
    review: change.review,
    offlineSale: change.offlineSale,
    returnRequest: change.returnRequest,
    actor: change.actor,
    description:
      shortfall > 0
        ? `${change.description || ""} (${shortfall} points already spent — recorded as owed)`.trim()
        : change.description || "",
    key: change.key,
    allocations,
    shortfall: shortfall || undefined,
  });

  return { user, taken, shortfall, allocations };
};

// The single entry point for a credit (points > 0: a new lot) or a debit
// (points < 0: taken earliest-expiry-first). Returns
// { user, lot?, allocations?, taken?, shortfall? }, { duplicate: true } if
// this key was already applied, or null when a debit can't be covered (or
// the user doesn't exist) — the caller must treat null as "nothing changed".
//
// Inside a caller's transaction (`session`), a LoyaltyConflictError aborts
// that whole transaction; on its own it's reported as null.
export const applyLoyaltyPointsChange = async ({
  userId,
  type,
  points,
  key,
  source,
  order = null,
  review,
  offlineSale,
  returnRequest,
  actor,
  description = "",
  preferLotIds,
  allowShortfall = false,
  expiresAt,
  session = null,
  now = new Date(),
}) => {
  if (!points) return null;
  if (!key) throw new Error("applyLoyaltyPointsChange needs an idempotency key");

  const change = {
    userId,
    type,
    points,
    key,
    source,
    order,
    review,
    offlineSale,
    returnRequest,
    actor,
    description,
    preferLotIds,
    allowShortfall,
    expiresAt,
  };

  try {
    return await runLoyaltyWrite(session, async (s) => {
      if (await alreadyApplied(key, s)) return { duplicate: true };
      return points > 0 ? creditPoints(s, change, now) : debitPoints(s, change, now);
    });
  } catch (error) {
    if (!session && error instanceof LoyaltyConflictError) return null;
    throw error;
  }
};

// Gives back the points an order redeemed, into the lots they came from.
// Points whose lot has already expired are refunded and expired again
// straight away (both entries in the ledger) rather than coming back as a
// fresh balance. Redemptions from before the lot scheme recorded no lots;
// those come back as one lot valid LOT_VALIDITY_DAYS from today.
export const refundRedeemedPoints = async ({
  order,
  session = null,
  description = `Refund for cancelled order ${order._id}`,
  now = new Date(),
}) => {
  const key = `refund:order:${order._id}`;

  return runLoyaltyWrite(session, async (s) => {
    if (await alreadyApplied(key, s)) return { duplicate: true };

    // The pre-lot code refunded without a key.
    if (
      await LoyaltyTransaction.exists({
        order: order._id,
        type: "refunded",
        key: { $exists: false },
      }).session(s)
    ) {
      return { duplicate: true };
    }

    const redemptions = await LoyaltyTransaction.find({
      order: order._id,
      type: "redeemed",
    }).session(s);

    const total = redemptions.reduce((sum, entry) => sum - entry.points, 0);
    if (total <= 0) return null;

    const restored = [];
    let expiredAgain = 0;
    let legacyPoints = 0;

    for (const entry of redemptions) {
      if (!entry.allocations?.length) {
        legacyPoints += -entry.points;
        continue;
      }

      for (const allocation of entry.allocations) {
        if (!allocation.lot) {
          restored.push({ lot: null, points: allocation.points });
          continue;
        }

        const backIntoLot = await LoyaltyLot.updateOne(
          { _id: allocation.lot, status: "available" },
          { $inc: { remainingPoints: allocation.points } },
          { session: s },
        );

        if (backIntoLot.modifiedCount === 1) {
          restored.push({ lot: allocation.lot, points: allocation.points });
        } else {
          await LoyaltyLot.updateOne(
            { _id: allocation.lot },
            { $inc: { expiredPoints: allocation.points } },
            { session: s },
          );
          restored.push({ lot: allocation.lot, points: allocation.points });
          expiredAgain += allocation.points;
        }
      }
    }

    let legacyLot = null;
    if (legacyPoints > 0) {
      [legacyLot] = await LoyaltyLot.create(
        [
          {
            user: order.user,
            source: "legacy_refund",
            order: order._id,
            originalPoints: legacyPoints,
            remainingPoints: legacyPoints,
            creditedAt: now,
            expiresAt: lotExpiryFor(now),
            key: `${key}:legacy-lot`,
            description,
          },
        ],
        { session: s },
      );
      restored.push({ lot: legacyLot._id, points: legacyPoints });
    }

    let user = await User.findByIdAndUpdate(
      order.user,
      { $inc: { loyaltyPoints: total } },
      { new: true, session: s },
    );

    if (!user) return null;

    await writeLedger(s, {
      user: order.user,
      type: "refunded",
      source: "order",
      points: total,
      balanceAfter: user.loyaltyPoints,
      order: order._id,
      description,
      key,
      allocations: restored,
      expiresAt: legacyLot?.expiresAt,
    });

    if (expiredAgain > 0) {
      user = await User.findByIdAndUpdate(
        order.user,
        { $inc: { loyaltyPoints: -expiredAgain } },
        { new: true, session: s },
      );

      await writeLedger(s, {
        user: order.user,
        type: "expired",
        source: "order",
        points: -expiredAgain,
        balanceAfter: user.loyaltyPoints,
        order: order._id,
        description: `${expiredAgain} refunded points belonged to a batch that had already expired`,
        key: `${key}:expired`,
      });
    }

    return { user, refunded: total, expiredAgain };
  });
};

// Points of this order already taken back. Orders from before the lot
// scheme never tracked it on the order, so it's read from their ledger.
const pointsAlreadyClawedBack = async (order, session) => {
  if (order.loyaltyEarnBase !== undefined && order.loyaltyEarnBase !== null) {
    return order.pointsClawedBack || 0;
  }

  const [legacy] = await LoyaltyTransaction.aggregate([
    {
      $match: {
        order: order._id,
        user: order.user,
        type: "clawback",
        description: { $regex: "^Reversed earn" },
      },
    },
    { $group: { _id: null, total: { $sum: "$points" } } },
  ]).session(session);

  return Math.max(order.pointsClawedBack || 0, -(legacy?.total || 0));
};

const orderLotIds = async (order, session) => {
  const lot = await LoyaltyLot.findOne({ key: `order:${order._id}` }).select("_id").session(session);
  return lot ? [lot._id] : [];
};

// Cancellation: an order whose points are still pending simply never
// gets them (the credit job only credits Delivered orders); points
// already credited are taken back, shortfall recorded as owed.
export const reverseOrderEarn = async ({ order, session = null, now = new Date() }) => {
  if (!order.pointsCredited || !(order.pointsEarned > 0)) return null;

  return runLoyaltyWrite(session, async (s) => {
    const already = await pointsAlreadyClawedBack(order, s);
    const remaining = order.pointsEarned - already;
    if (remaining <= 0) return null;

    const result = await applyLoyaltyPointsChange({
      userId: order.user,
      type: "clawback",
      source: "order",
      points: -remaining,
      key: `order-reversal:${order._id}`,
      order: order._id,
      description: `Reversed earn from cancelled order ${order._id}`,
      preferLotIds: await orderLotIds(order, s),
      allowShortfall: true,
      session: s,
      now,
    });

    await Order.updateOne(
      { _id: order._id },
      { $set: { pointsClawedBack: order.pointsEarned } },
      { session: s },
    );

    return result;
  });
};

// A refunded return takes back the returned share of the order's earn:
// what's left is floor(pointsEarned x (base - everything refunded so far)
// / base), so several partial returns add up to exactly the same total as
// one big one, and the total never exceeds pointsEarned. Before the order
// is credited this only shrinks the pending amount; after, it comes off
// the balance (shortfall recorded as owed). `order` must already carry
// this return in refundedAmount.
export const clawBackForReturn = async ({
  order,
  returnRequest,
  session = null,
  now = new Date(),
}) => {
  const earned = order.pointsEarned || 0;
  // Orders from before the lot scheme earned on totalPrice.
  const base = order.loyaltyEarnBase ?? order.totalPrice;
  if (earned <= 0 || !(base > 0)) return null;

  return runLoyaltyWrite(session, async (s) => {
    const already = await pointsAlreadyClawedBack(order, s);
    const keep = Math.floor((earned * Math.max(0, base - (order.refundedAmount || 0))) / base);
    const target = Math.min(earned, earned - keep);
    const delta = target - already;
    if (delta <= 0) return null;

    // Conditional on the value read, so two returns of the same order
    // settling at once can't both take the same share. (null also matches
    // orders saved before the field existed.)
    const readValue = order.pointsClawedBack || 0;
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, pointsClawedBack: readValue === 0 ? { $in: [0, null] } : readValue },
      { $set: { pointsClawedBack: target } },
      { new: true, session: s },
    );

    if (!claimed) throw new LoyaltyConflictError("Order points changed during the return");

    if (!claimed.pointsCredited) return { pendingReduced: delta };

    return applyLoyaltyPointsChange({
      userId: order.user,
      type: "clawback",
      source: "order",
      points: -delta,
      key: `return:${returnRequest._id}`,
      order: order._id,
      returnRequest: returnRequest._id,
      description: `Reversed earn for returned item: ${returnRequest.productName}`,
      preferLotIds: await orderLotIds(order, s),
      allowShortfall: true,
      session: s,
      now,
    });
  });
};

// Takes back a referral bonus paid on this order (it was cancelled), using
// the exact amounts snapshotted on the order, and frees the referred
// customer to qualify again with a genuinely kept order.
export const reverseReferralBonus = async ({ order, session = null, now = new Date() }) => {
  if (!order.referralBonusPaid) return null;

  return runLoyaltyWrite(session, async (s) => {
    const referredUser = await User.findById(order.user).select("referredBy").session(s);

    if (referredUser?.referredBy && order.referralBonusPoints.referrer > 0) {
      await applyLoyaltyPointsChange({
        userId: referredUser.referredBy,
        type: "clawback",
        source: "referral",
        points: -order.referralBonusPoints.referrer,
        key: `referral-reversal:referrer:order:${order._id}`,
        order: order._id,
        description: `Reversed referral bonus — order ${order._id} cancelled`,
        allowShortfall: true,
        session: s,
        now,
      });
    }

    if (order.referralBonusPoints.referred > 0) {
      await applyLoyaltyPointsChange({
        userId: order.user,
        type: "clawback",
        source: "referral",
        points: -order.referralBonusPoints.referred,
        key: `referral-reversal:referred:order:${order._id}`,
        order: order._id,
        description: `Reversed referral signup bonus — order ${order._id} cancelled`,
        allowShortfall: true,
        session: s,
        now,
      });
    }

    await User.updateOne({ _id: order.user }, { $set: { referralRewarded: false } }, { session: s });
    return { reversed: true };
  });
};

// Settles one delivered order whose return window has closed: credits its
// remaining earn as a new lot and, if this is the referred customer's
// first kept order, the referral bonus to both sides. Everything is
// re-checked inside the transaction, immediately before crediting.
// Returns null when there's nothing to do (yet).
const settleOrderPoints = async (orderId, referralSettings, now) =>
  runLoyaltyWrite(null, async (s) => {
    const order = await Order.findOne({
      _id: orderId,
      orderStatus: "Delivered",
      pointsCredited: { $ne: true },
      pointsAvailableAt: { $lte: now },
    }).session(s);

    if (!order) return null;

    const openReturn = await ReturnRequest.exists({
      order: order._id,
      status: { $in: OPEN_RETURN_STATUSES },
    }).session(s);

    if (openReturn) return { waitingOnReturn: true };

    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, orderStatus: "Delivered", pointsCredited: { $ne: true } },
      { $set: { pointsCredited: true, pointsCreditedAt: now } },
      { new: true, session: s },
    );

    if (!claimed) return null;

    const points = (claimed.pointsEarned || 0) - (claimed.pointsClawedBack || 0);
    const outcome = { userId: claimed.user, orderId: claimed._id, points: 0, referral: null };

    if (points > 0) {
      const credit = await applyLoyaltyPointsChange({
        userId: claimed.user,
        type: "earned",
        source: "order",
        points,
        key: `order:${claimed._id}`,
        order: claimed._id,
        description: `Earned on order ${claimed._id}`,
        session: s,
        now,
      });
      outcome.points = points;
      outcome.expiresAt = credit?.lot?.expiresAt;
    }

    // Claimed atomically, so two orders of the same referred customer
    // settling at once can't both pay it.
    const referred = await User.findOneAndUpdate(
      { _id: claimed.user, referredBy: { $ne: null }, referralRewarded: { $ne: true } },
      { $set: { referralRewarded: true } },
      { new: false, session: s },
    );

    if (referred) {
      const { referrerPoints, referredPoints } = referralSettings;

      if (referrerPoints > 0) {
        await applyLoyaltyPointsChange({
          userId: referred.referredBy,
          type: "referral_bonus",
          source: "referral",
          points: referrerPoints,
          key: `referral:referrer:order:${claimed._id}`,
          order: claimed._id,
          description: `Referral bonus for inviting ${referred.name}`,
          session: s,
          now,
        });
      }

      if (referredPoints > 0) {
        await applyLoyaltyPointsChange({
          userId: referred._id,
          type: "referral_bonus",
          source: "referral",
          points: referredPoints,
          key: `referral:referred:order:${claimed._id}`,
          order: claimed._id,
          description: "Referral signup bonus",
          session: s,
          now,
        });
      }

      await Order.updateOne(
        { _id: claimed._id },
        {
          $set: {
            referralBonusPaid: true,
            referralBonusPoints: { referrer: referrerPoints, referred: referredPoints },
          },
        },
        { session: s },
      );

      outcome.referral = {
        referrerId: referred.referredBy,
        referrerPoints,
        referredPoints,
      };
    }

    return outcome;
  });

const BATCH_LIMIT = 500;

// Cron: credits every delivered order whose return window has closed.
export const creditDueOrderPoints = async ({ now = new Date() } = {}) => {
  const due = await Order.find({
    orderStatus: "Delivered",
    pointsCredited: { $ne: true },
    pointsAvailableAt: { $lte: now },
  })
    .select("_id")
    .sort({ pointsAvailableAt: 1 })
    .limit(BATCH_LIMIT);

  if (due.length === 0) return { credited: 0, waitingOnReturn: 0, failed: 0 };

  const referralSettings = await getReferralSettings();
  const results = { credited: 0, waitingOnReturn: 0, failed: 0 };

  for (const { _id } of due) {
    let outcome;

    try {
      outcome = await settleOrderPoints(_id, referralSettings, now);
    } catch (error) {
      results.failed += 1;
      console.error(`[loyalty] crediting order ${_id} failed:`, error);
      continue;
    }

    if (!outcome || outcome.duplicate) continue;
    if (outcome.waitingOnReturn) {
      results.waitingOnReturn += 1;
      continue;
    }

    results.credited += 1;

    if (outcome.points > 0) {
      notifyUser({
        userId: outcome.userId,
        type: "loyalty_points",
        title: "Your loyalty points are ready to use",
        message: `${outcome.points} points from order ${outcome.orderId} are now available.`,
        link: "/loyalty-history",
      });
    }

    if (outcome.referral) {
      if (outcome.referral.referrerPoints > 0) {
        notifyUser({
          userId: outcome.referral.referrerId,
          type: "loyalty_points",
          title: "You earned a referral bonus!",
          message: `${outcome.referral.referrerPoints} points added — your friend's first order is complete.`,
          link: "/loyalty-history",
        });
      }
      if (outcome.referral.referredPoints > 0) {
        notifyUser({
          userId: outcome.userId,
          type: "loyalty_points",
          title: "Your referral bonus is here!",
          message: `${outcome.referral.referredPoints} referral points added to your account.`,
          link: "/loyalty-history",
        });
      }
    }
  }

  return results;
};

const formatIstDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

const expireLot = (lotId, now) =>
  runLoyaltyWrite(null, async (s) => {
    const lot = await LoyaltyLot.findOne({
      _id: lotId,
      status: "available",
      expiresAt: { $lte: now },
    }).session(s);

    if (!lot) return null;

    const points = lot.remainingPoints;

    const updated = await LoyaltyLot.updateOne(
      { _id: lot._id, status: "available", remainingPoints: points },
      {
        $set: { status: "expired", remainingPoints: 0, expiredAt: now },
        $inc: { expiredPoints: points },
      },
      { session: s },
    );

    if (updated.modifiedCount !== 1) throw new LoyaltyConflictError();
    if (points === 0) return { userId: lot.user, points: 0 };

    const user = await User.findOneAndUpdate(
      { _id: lot.user, loyaltyPoints: { $gte: points } },
      { $inc: { loyaltyPoints: -points } },
      { new: true, session: s },
    );

    if (!user) {
      throw new LoyaltyConflictError(
        `User ${lot.user} balance is below lot ${lot._id} — run the loyalty reconciliation`,
      );
    }

    await writeLedger(s, {
      user: lot.user,
      type: "expired",
      source: lot.source,
      points: -points,
      balanceAfter: user.loyaltyPoints,
      order: lot.order,
      lot: lot._id,
      key: `expire:lot:${lot._id}`,
      description: `${points} points from your ${formatIstDate(lot.creditedAt)} batch expired`,
    });

    return { userId: lot.user, points, user };
  });

// Cron: expires the unspent remainder of every lot past its expiry. One
// transaction per lot, so a concurrent redemption either finishes first
// (and this expires only what's left) or aborts. One notification per
// customer per run, after the database changes have committed — a rerun
// finds nothing left to expire, so it never notifies twice.
export const expireDueLots = async ({ now = new Date() } = {}) => {
  const due = await LoyaltyLot.find({ status: "available", expiresAt: { $lte: now } })
    .select("_id")
    .sort({ expiresAt: 1 })
    .limit(BATCH_LIMIT);

  const byUser = new Map();
  let failed = 0;

  for (const { _id } of due) {
    try {
      const outcome = await expireLot(_id, now);
      if (!outcome?.points) continue;

      const key = String(outcome.userId);
      const entry = byUser.get(key) || { user: outcome.user, points: 0 };
      entry.points += outcome.points;
      entry.user = outcome.user;
      byUser.set(key, entry);
    } catch (error) {
      failed += 1;
      console.error(`[loyalty] expiring lot ${_id} failed:`, error);
    }
  }

  for (const { user, points } of byUser.values()) {
    notifyUser({
      userId: user._id,
      type: "loyalty_points",
      title: "Some of your loyalty points have expired",
      message: `${points} points expired 365 days after they were credited.`,
      link: "/loyalty-history",
    });

    if (user.email) {
      sendEmail({
        to: user.email,
        subject: "Some of your loyalty points have expired",
        html: `
          <p>Hi ${escapeHtml(user.name || "there")},</p>
          <p>${points} loyalty points on your Mittal Collections account expired today —
          each batch of points is valid for 365 days from the day it was credited.
          You have ${user.loyaltyPoints} points left to use.</p>
        `,
      }).catch((error) => console.error(`Points expiry email failed for ${user.email}:`, error));
    }
  }

  return { expiredLots: due.length - failed, usersNotified: byUser.size, failed };
};

// Customer-facing view: what's spendable, what's pending (and until when),
// each batch with its expiry, and lifetime totals by kind.
export const getLoyaltySummary = async (userId, now = new Date()) => {
  const state = await loadBalanceState(userId, null, now);
  if (!state) return null;

  const [pendingOrders, totals] = await Promise.all([
    Order.find({
      user: userId,
      orderStatus: "Delivered",
      pointsCredited: { $ne: true },
      pointsAvailableAt: { $exists: true },
    })
      .select("pointsEarned pointsClawedBack pointsAvailableAt deliveredAt")
      .sort({ pointsAvailableAt: 1 })
      .lean(),
    LoyaltyTransaction.aggregate([
      { $match: { user: state.user._id } },
      { $group: { _id: "$type", total: { $sum: "$points" } } },
    ]),
  ]);

  const openReturns = await ReturnRequest.find({
    order: { $in: pendingOrders.map((o) => o._id) },
    status: { $in: OPEN_RETURN_STATUSES },
  })
    .select("order")
    .lean();
  const ordersWithOpenReturn = new Set(openReturns.map((r) => String(r.order)));

  const pending = pendingOrders
    .map((o) => ({
      order: o._id,
      points: (o.pointsEarned || 0) - (o.pointsClawedBack || 0),
      deliveredAt: o.deliveredAt,
      availableAt: o.pointsAvailableAt,
      waitingOnReturn: ordersWithOpenReturn.has(String(o._id)),
    }))
    .filter((p) => p.points > 0);

  const totalByType = Object.fromEntries(totals.map((t) => [t._id, t.total]));
  const soon = new Date(now.getTime() + 30 * DAY_MS);

  return {
    available: state.spendable,
    legacyUnbatched: state.unbatched,
    owed: state.user.loyaltyPointsOwed || 0,
    pendingTotal: pending.reduce((sum, p) => sum + p.points, 0),
    pending,
    batches: state.liveLots.map((lot) => ({
      _id: lot._id,
      source: lot.source,
      originalPoints: lot.originalPoints,
      remainingPoints: lot.remainingPoints,
      creditedAt: lot.creditedAt,
      expiresAt: lot.expiresAt,
    })),
    expiringSoon: state.liveLots
      .filter((lot) => lot.expiresAt <= soon)
      .reduce((sum, lot) => sum + lot.remainingPoints, 0),
    nextExpiry: state.liveLots[0]
      ? { points: state.liveLots[0].remainingPoints, expiresAt: state.liveLots[0].expiresAt }
      : null,
    totals: {
      redeemed: -(totalByType.redeemed || 0),
      expired: -(totalByType.expired || 0),
      refunded: totalByType.refunded || 0,
      clawedBack: -(totalByType.clawback || 0) - (totalByType.debt_recovered || 0),
    },
    validityDays: LOT_VALIDITY_DAYS,
  };
};
