import NotificationBudget from "../models/NotificationBudget.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BUDGET_RETENTION_MS = 30 * DAY_MS;

// Start of the IST calendar day containing `now` (00:00:00.000 IST),
// correct whatever timezone the server process runs in (UTC on Render).
export const istDayStart = (now = new Date()) => {
  const shifted = new Date(now).getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS);
};

// "YYYY-MM-DD" of the IST calendar day containing `now`.
export const istDayKey = (now = new Date()) =>
  new Date(istDayStart(now).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const MAX_ATTEMPTS = 3;

// Atomically takes one of today's `limit` slots for `kind`. Resolves true
// if a slot was taken (the caller may send), false if the day's budget is
// spent. A slot is never handed back, so `limit` caps attempts per day even
// when some of those emails then fail.
//
// The conditional upsert is the whole trick: with count < limit the filter
// matches and $inc takes a slot; on the day's first call there is no
// document yet, so the upsert creates it at count 1. Once count reaches
// limit the filter matches nothing and the upsert tries to insert a second
// document with the same _id — a duplicate-key error, which here simply
// means "spent". The same error also happens when two first-of-the-day
// calls race to create the document; the loser retries and then takes its
// slot from the document the winner created.
export const reserveNotificationSlot = async (kind, limit, now = new Date()) => {
  const _id = `${kind}:${istDayKey(now)}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const doc = await NotificationBudget.findOneAndUpdate(
        { _id, count: { $lt: limit } },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(new Date(now).getTime() + BUDGET_RETENTION_MS) },
        },
        { upsert: true, returnDocument: "after" },
      );
      return Boolean(doc);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await NotificationBudget.findById(_id).select("count").lean();
      if (existing && existing.count >= limit) return false;
      // Lost the first-of-the-day creation race: retry against the winner's doc.
    }
  }

  return false;
};
