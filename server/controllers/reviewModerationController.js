import Review, {
  REVIEW_HIDDEN_REASON_MAX_LENGTH,
  REVIEW_REPLY_MAX_LENGTH,
} from "../models/Review.js";
import { istDayStart, istDayEnd } from "../utils/istDate.js";

// ============================
// Review moderation (Admin): hide/unhide, the store's public reply, list
// filters and a summary. None of this ever touches loyalty points — the
// review bonus is granted on approval and reversed only on delete (see
// reviewController.js); hiding is a display decision, nothing more.
// ============================

// A client-facing 400 carrying its own message, so the query builder can
// turn away a bad value without each caller re-checking it.
class BadFilterError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Each filter is read as a plain string and mapped to a fixed Mongo
// condition — no part of req.query is ever passed into the query itself,
// so an operator-shaped value can't reach Mongo. A repeated param
// (?status=a&status=b arrives as an array) or an unknown value is a 400,
// never a 500 or a silently-ignored filter.
const readParam = (query, key) => {
  const value = query[key];

  if (value === undefined || value === "") return "";
  if (typeof value !== "string") throw new BadFilterError(`Invalid ${key} filter`);

  return value.trim();
};

const pickOne = (query, key, allowed) => {
  const value = readParam(query, key);

  if (value === "" || value === "all") return "";
  if (!allowed.includes(value)) throw new BadFilterError(`Invalid ${key} filter`);

  return value;
};

const readDate = (query, key) => {
  const value = readParam(query, key);

  if (value === "") return "";

  // Must be a real calendar day: "2026-02-31" passes the pattern but
  // Date rolls it into March, so round-trip the parsed date to be sure.
  const parsed = istDayStart(value);
  if (
    !DATE_PATTERN.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    new Date(parsed.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10) !== value
  ) {
    throw new BadFilterError(`Invalid ${key} date (use YYYY-MM-DD)`);
  }

  return value;
};

// Builds the admin list's Mongo filter from req.query. Throws
// BadFilterError for anything it doesn't recognise.
export const buildAdminReviewFilter = (query = {}) => {
  const filter = {};
  const and = [];

  const status = pickOne(query, "status", ["pending", "approved"]);
  if (status === "pending") filter.isApproved = { $ne: true };
  if (status === "approved") filter.isApproved = true;

  const visibility = pickOne(query, "visibility", ["hidden", "visible"]);
  if (visibility === "hidden") filter.isHidden = true;
  if (visibility === "visible") filter.isHidden = { $ne: true };

  const rating = pickOne(query, "rating", ["1", "2", "3", "4", "5"]);
  if (rating) filter.rating = Number(rating);

  const hasPhotos = pickOne(query, "hasPhotos", ["true", "false"]);
  if (hasPhotos === "true") filter["images.0"] = { $exists: true };
  if (hasPhotos === "false") filter["images.0"] = { $exists: false };

  // "Rewarded" = this review actually earned loyalty points on approval
  // (pointsAwarded > 0) and an admin hasn't reversed them; a capped or
  // order-less review is not rewarded. "reversed" = the bonus was paid and
  // then taken back (bonusReversal is select:false, but a query can still
  // match on it).
  const rewarded = pickOne(query, "rewarded", ["true", "false", "reversed"]);
  if (rewarded === "true") {
    filter.pointsAwarded = { $gt: 0 };
    filter["bonusReversal.reversedAt"] = { $exists: false };
  }
  if (rewarded === "reversed") filter["bonusReversal.reversedAt"] = { $exists: true };
  if (rewarded === "false") and.push({ $or: [{ pointsAwarded: { $exists: false } }, { pointsAwarded: { $lte: 0 } }] });

  // from/to are calendar days in IST, inclusive (submission date).
  const from = readDate(query, "from");
  const to = readDate(query, "to");
  if (from && to && from > to) throw new BadFilterError("'from' date must be on or before 'to' date");
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = istDayStart(from);
    if (to) filter.createdAt.$lte = istDayEnd(to);
  }

  if (and.length) filter.$and = and;

  return filter;
};

export const sendFilterError = (res, error) => {
  if (error instanceof BadFilterError) {
    res.status(400).json({ success: false, message: error.message });
    return true;
  }
  return false;
};

// A required, trimmed, length-capped plain-text body field. Returns the
// trimmed string, or null if missing/blank/not a string/too long.
const readText = (value, max) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
};

const notFound = (res) =>
  res.status(404).json({ success: false, message: "Review not found" });

const serverError = (res, label, error) => {
  console.error(`${label} Error:`, error);
  res.status(500).json({ success: false, message: "Server Error" });
};

// ============================
// HIDE REVIEW (Admin)
// ============================
export const hideReview = async (req, res) => {
  try {
    const reason = readText(req.body?.reason, REVIEW_HIDDEN_REASON_MAX_LENGTH);

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: `A reason is required to hide a review (up to ${REVIEW_HIDDEN_REASON_MAX_LENGTH} characters)`,
      });
    }

    // Only the moderation fields change — pointsAwarded,
    // reviewPointsProcessed and the loyalty ledger are left exactly as
    // they are.
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isHidden: true,
          hiddenReason: reason,
          hiddenBy: req.user._id,
          hiddenAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );

    if (!review) return notFound(res);

    res.status(200).json({ success: true, message: "Review hidden", review });
  } catch (error) {
    serverError(res, "Hide Review", error);
  }
};

// ============================
// UNHIDE REVIEW (Admin)
// ============================
export const unhideReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { isHidden: false, hiddenReason: "", hiddenBy: null, hiddenAt: null } },
      { new: true },
    );

    if (!review) return notFound(res);

    res.status(200).json({ success: true, message: "Review visible again", review });
  } catch (error) {
    serverError(res, "Unhide Review", error);
  }
};

// ============================
// SET / EDIT ADMIN REPLY (Admin)
// ============================
export const setReviewReply = async (req, res) => {
  try {
    const text = readText(req.body?.text, REVIEW_REPLY_MAX_LENGTH);

    if (!text) {
      return res.status(400).json({
        success: false,
        message: `Reply text is required (up to ${REVIEW_REPLY_MAX_LENGTH} characters)`,
      });
    }

    const now = new Date();

    // One atomic update, no prior read: two concurrent saves can't both
    // read "no reply yet" and stamp different repliedAt values. Editing
    // keeps the original repliedAt (the $ifNull reads the stored value
    // inside the same update); updatedAt tracks the latest edit.
    //
    // Schema validators don't run on update pipelines, so readText above
    // is the length/blank check. $literal stops a reply that happens to
    // start with "$" from being read as a field path.
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      [
        {
          $set: {
            adminReply: {
              text: { $literal: text },
              repliedBy: req.user._id,
              updatedAt: now,
              repliedAt: { $ifNull: ["$adminReply.repliedAt", now] },
            },
          },
        },
      ],
      { new: true, updatePipeline: true },
    );

    if (!review) return notFound(res);

    res.status(200).json({ success: true, message: "Reply saved", review });
  } catch (error) {
    serverError(res, "Set Review Reply", error);
  }
};

// ============================
// REMOVE ADMIN REPLY (Admin)
// ============================
export const deleteReviewReply = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { adminReply: null } },
      { new: true },
    );

    if (!review) return notFound(res);

    res.status(200).json({ success: true, message: "Reply removed", review });
  } catch (error) {
    serverError(res, "Delete Review Reply", error);
  }
};

// ============================
// REVIEW SUMMARY (Admin)
// ============================
// Store-wide numbers for the top of the admin Reviews page — independent
// of whatever list filters are applied. Averages are null when there are
// no reviews in that group (rather than a misleading 0).
const roundAvg = (value) => (typeof value === "number" ? Math.round(value * 100) / 100 : null);

export const getReviewSummary = async (req, res) => {
  try {
    // Three buckets, matching the list's Bonus filter: rewarded (paid, not
    // reversed), reversed (paid, then taken back) and not rewarded.
    const paidExpr = { $gt: [{ $ifNull: ["$pointsAwarded", 0] }, 0] };
    const reversedExpr = { $eq: [{ $type: "$bonusReversal.reversedAt" }, "date"] };
    const rewardedExpr = { $and: [paidExpr, { $not: [reversedExpr] }] };

    const [stats] = await Review.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ["$isApproved", true] }, 1, 0] } },
          hidden: { $sum: { $cond: [{ $eq: ["$isHidden", true] }, 1, 0] } },
          publicCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ["$isApproved", true] }, { $ne: ["$isHidden", true] }] }, 1, 0],
            },
          },
          averageRating: { $avg: "$rating" },
          publicAverageRating: {
            $avg: {
              $cond: [
                { $and: [{ $eq: ["$isApproved", true] }, { $ne: ["$isHidden", true] }] },
                "$rating",
                null,
              ],
            },
          },
          rewardedCount: { $sum: { $cond: [rewardedExpr, 1, 0] } },
          rewardedAverageRating: { $avg: { $cond: [rewardedExpr, "$rating", null] } },
          reversedCount: { $sum: { $cond: [reversedExpr, 1, 0] } },
          nonRewardedCount: { $sum: { $cond: [paidExpr, 0, 1] } },
          nonRewardedAverageRating: { $avg: { $cond: [paidExpr, null, "$rating"] } },
        },
      },
    ]);

    const s = stats || {};
    const total = s.total || 0;
    const approved = s.approved || 0;

    res.status(200).json({
      success: true,
      summary: {
        total,
        byStatus: { approved, pending: total - approved },
        hidden: s.hidden || 0,
        public: s.publicCount || 0,
        averageRating: roundAvg(s.averageRating),
        publicAverageRating: roundAvg(s.publicAverageRating),
        rewarded: { count: s.rewardedCount || 0, averageRating: roundAvg(s.rewardedAverageRating) },
        reversed: s.reversedCount || 0,
        nonRewarded: { count: s.nonRewardedCount || 0, averageRating: roundAvg(s.nonRewardedAverageRating) },
      },
    });
  } catch (error) {
    serverError(res, "Get Review Summary", error);
  }
};
