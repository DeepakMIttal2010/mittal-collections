import Review from "../models/Review.js";
import Order from "../models/Order.js";
import { applyLoyaltyPointsChange, reviewBonusReversalPlan } from "./loyaltyPoints.js";
import { getReviewBonusEligibility, isProductFullyRefunded } from "./reviewEligibility.js";

// The review loyalty bonus: paid once per review on approval (or later by
// an admin's "Grant bonus"), and never for an item the customer didn't
// keep. Every function here runs inside the caller's transaction
// (`session`; null only where non-transactional writes are allowed, see
// orderTransactions.js) and is safe to run again on a retry.

// Flat bonus for a review the admin actually approves — deliberately not
// randomized/"win up to X" (that reads as a chance-based contest, which
// carries real regulatory risk in several Indian states); a guaranteed
// amount is simpler and carries none of that risk.
export const REVIEW_BONUS_POINTS = 50;

// One order can contain several products, and a customer can review each
// one — but the combined bonus across all reviews tied to the same order
// is capped here, not per review. A reversed bonus's share stays used.
export const ORDER_REVIEW_BONUS_CAP = 50;

// What an approved review's bonus came to:
//   { status: "awarded", points }  — processed now (points may be 0 when
//                                    there is no linked order or the
//                                    order's cap is already used)
//   { status: "held", reason }     — nothing paid, nothing processed, no
//                                    cap used; can be granted later
//   { status: "already" }          — processed before (or by a request
//                                    racing this one); nothing done
//
// releaseHold: only the admin "Grant bonus" action (reviews + loyalty
// permissions) passes true. Without it — a re-approval — a review that is
// already on hold is never paid; its hold reason is just refreshed
// ("return_rejected" once the item is kept again, so the admin sees that
// a grant is now possible).
export const awardReviewBonus = async ({ reviewId, releaseHold = false, session = null }) => {
  const review = await Review.findById(reviewId)
    .select("+bonusReversal +bonusHold")
    .session(session);

  if (!review || review.reviewPointsProcessed || review.bonusReversal?.reversedAt) {
    return { status: "already" };
  }

  // Checked inside the transaction: a return or cancellation committed
  // before this point is seen here. (One committed after it is caught by
  // the automatic reversal when it completes — see below.)
  const { eligible, holdReason: currentReason } = await getReviewBonusEligibility(review, session);

  const keepHeld = review.bonusHold?.reason && !releaseHold;
  const holdReason = keepHeld && eligible ? "return_rejected" : currentReason;

  if (keepHeld || (!eligible && holdReason)) {
    const held = await Review.findOneAndUpdate(
      { _id: review._id, reviewPointsProcessed: { $ne: true } },
      { $set: { bonusHold: { reason: holdReason, at: new Date() } } },
      { new: true, session, projection: { bonusHold: 1 } },
    );

    return held ? { status: "held", reason: holdReason } : { status: "already" };
  }

  // The claim: only one request can move this review to processed. Two
  // concurrent approvals (or an approval and a grant) both writing this
  // document inside transactions conflict, and the retry finds it claimed.
  const claimedReview = await Review.findOneAndUpdate(
    { _id: review._id, reviewPointsProcessed: { $ne: true } },
    { $set: { reviewPointsProcessed: true }, $unset: { bonusHold: 1 } },
    { new: false, session },
  );

  if (!claimedReview) return { status: "already" };

  // No linked order means no verified purchase — this is a "reward for
  // buying" scheme, not a reward for reviewing, so an unverified review
  // earns nothing (it can still be approved and shown publicly).
  let points = 0;

  if (eligible) {
    // Atomically reserve headroom against the order's shared cap.
    // {new: false} returns the pre-update document, so alreadyAwarded is
    // the true prior total — the read and the write are one atomic step,
    // so a concurrent sibling approval can't see a stale value.
    const orderBefore = await Order.findByIdAndUpdate(
      review.order,
      [
        {
          $set: {
            reviewBonusAwarded: {
              $min: [
                ORDER_REVIEW_BONUS_CAP,
                { $add: [{ $ifNull: ["$reviewBonusAwarded", 0] }, REVIEW_BONUS_POINTS] },
              ],
            },
          },
        },
      ],
      { new: false, updatePipeline: true, session },
    );

    const alreadyAwarded = orderBefore?.reviewBonusAwarded || 0;
    points = Math.max(0, Math.min(REVIEW_BONUS_POINTS, ORDER_REVIEW_BONUS_CAP - alreadyAwarded));
  }

  // The bonus is its own batch, available straight away and valid for 365
  // days from approval. Keyed by review, so it can never be credited twice.
  if (points > 0) {
    await applyLoyaltyPointsChange({
      userId: review.user,
      type: "earned",
      source: "review",
      points,
      key: `review:${review._id}`,
      order: review.order || null,
      review: review._id,
      description: "Bonus for an approved product review",
      session,
    });
  }

  await Review.updateOne({ _id: review._id }, { $set: { pointsAwarded: points } }, { session });
  return { status: "awarded", points };
};

export class ReversalRefusedError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Takes back a paid review bonus — the shared core of the admin "Reverse
// bonus" action and the automatic reversals (item returned, order
// cancelled/deleted). actor: { id, name } for an admin; null for the
// system. Throws ReversalRefusedError when there is nothing to reverse.
//
// The bonus's own batch is debited first, then earliest-expiry; whatever
// was already spent is recorded as owed (settled from future credits),
// never a negative balance; an already-expired part is neither debited nor
// owed (reviewBonusReversalPlan). The ledger key is shared with deleteReview's
// clawback, so the ledger can never hold two reversals of the same bonus.
// The order's cap is left as it is — a reversed bonus's share stays used.
export const applyReviewBonusReversal = async ({
  reviewId,
  reason,
  evidence = "",
  actor = null,
  session = null,
}) => {
  const current = await Review.findById(reviewId).select("+bonusReversal").session(session);

  if (!current) throw new ReversalRefusedError(404, "Review not found");
  if (current.bonusReversal?.reversedAt) {
    throw new ReversalRefusedError(409, "This review's bonus has already been reversed");
  }
  if (!(current.pointsAwarded > 0)) {
    throw new ReversalRefusedError(400, "This review did not receive a bonus");
  }

  const points = current.pointsAwarded;

  // The guard: only one request can move a review from "no reversal" to
  // "reversed" (conditional on the exact state just read). A concurrent
  // second request either fails this filter or, inside a transaction,
  // hits a write conflict and retries into it.
  const claimed = await Review.findOneAndUpdate(
    {
      _id: current._id,
      pointsAwarded: points,
      "bonusReversal.reversedAt": { $exists: false },
    },
    {
      $set: {
        bonusReversal: {
          reversedAt: new Date(),
          reversedBy: actor ? actor.id : null,
          reversedByName: actor ? actor.name || "" : "System",
          reason,
          evidence,
          points,
        },
      },
    },
    { new: true, session, projection: { bonusReversal: 1 } },
  );

  if (!claimed) {
    throw new ReversalRefusedError(409, "This review's bonus has already been reversed");
  }

  // The part of the bonus whose batch already expired is not taken back
  // and never becomes owed — only the still-valid part is reversed, and
  // nothing is written to the ledger when that comes to 0.
  const plan = await reviewBonusReversalPlan({ reviewId: current._id, points, session });

  let pointsDebited = 0;
  let shortfall = 0;

  if (plan.debit > 0) {
    const result = await applyLoyaltyPointsChange({
      userId: current.user,
      type: "clawback",
      source: "review_bonus_reversal",
      points: -plan.debit,
      key: `review-reversal:${current._id}`,
      order: current.order || null,
      review: current._id,
      ...(actor && { actor: { id: actor.id, name: actor.name || "" } }),
      description: actor ? "Review bonus reversed" : `Review bonus reversed — ${reason}`,
      preferLotIds: plan.lotIds,
      allowShortfall: true,
      session,
    });

    if (!result) throw new ReversalRefusedError(400, "The reviewer's account no longer exists");
    if (result.duplicate) {
      throw new ReversalRefusedError(409, "This review's bonus has already been reversed");
    }

    pointsDebited = result.taken || 0;
    shortfall = result.shortfall || 0;
  }

  const expiredPortion = plan.expiredPortion;

  await Review.updateOne(
    { _id: current._id },
    {
      $set: {
        "bonusReversal.pointsDebited": pointsDebited,
        "bonusReversal.shortfall": shortfall,
        "bonusReversal.expiredPortion": expiredPortion,
      },
    },
    { session },
  );

  return { ...claimed.bonusReversal.toObject(), pointsDebited, shortfall, expiredPortion };
};

// System reversal of every paid, not-yet-reversed bonus among the reviews
// matching `filter`. A review that has nothing left to reverse (already
// reversed by an admin, or by a racing request) is simply skipped.
const reverseMatchingBonuses = async (filter, reason, session) => {
  const reviews = await Review.find({
    ...filter,
    pointsAwarded: { $gt: 0 },
    "bonusReversal.reversedAt": { $exists: false },
  })
    .select("_id")
    .session(session)
    .lean();

  const reversed = [];

  for (const { _id } of reviews) {
    try {
      reversed.push(await applyReviewBonusReversal({ reviewId: _id, reason, session }));
    } catch (error) {
      // Thrown before any write except "account no longer exists", where
      // there is nobody left to debit — the claim stands as the record.
      if (!(error instanceof ReversalRefusedError)) throw error;
    }
  }

  return reversed;
};

// An order cancelled or soft-deleted: no review on it keeps its bonus.
export const reverseReviewBonusesForOrder = ({ order, reason, session = null }) =>
  reverseMatchingBonuses({ order: order._id }, reason, session);

// A refunded return: once refunds cover every unit of the product on the
// order, that product's review bonus is taken back. A partial return
// (some units kept) leaves it alone.
export const reverseReviewBonusIfFullyReturned = async ({ order, productId, session = null }) => {
  if (!(await isProductFullyRefunded(order, productId, session))) return [];
  return reverseMatchingBonuses({ order: order._id, product: productId }, "Item returned", session);
};
