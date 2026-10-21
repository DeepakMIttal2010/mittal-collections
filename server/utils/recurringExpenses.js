import Expense from "../models/Expense.js";
import RecurringExpense from "../models/RecurringExpense.js";

const IST_OFFSET = "+05:30";

export const round2 = (n) => Math.round(n * 100) / 100;

// Calendar parts of an instant as seen in India (the business's clock).
// Never use the server's own timezone -- Render runs in UTC, which would
// flip the date for anything between 00:00 and 05:30 IST.
export const istParts = (date) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })
    .format(date)
    .split("-")
    .map(Number);

  return { y, m, d };
};

const pad = (n) => String(n).padStart(2, "0");

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// "YYYY-MM-DD" -> Date at noon IST, or null if it isn't a real calendar
// date (rejects "2026-02-31", which Date would silently roll into March).
export const parseIstDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;

  return new Date(`${value}T12:00:00${IST_OFFSET}`);
};

export const toIstDateString = (date) => {
  const { y, m, d } = istParts(date);
  return `${y}-${pad(m)}-${pad(d)}`;
};

// The entry date of a template for a given month: its start day-of-month,
// clamped to that month's length.
const entryDateFor = (template, y, m) => {
  const { d: startDay } = istParts(template.startDate);
  const day = Math.min(startDay, daysInMonth(y, m));

  return new Date(`${y}-${pad(m)}-${pad(day)}T12:00:00${IST_OFFSET}`);
};

// Creates every missing monthly Expense for every active template, from
// its start month up to (and including) the current month, but never an
// entry dated after `now`. Idempotent: the unique {recurringTemplate,
// periodKey} index plus $setOnInsert means running it repeatedly, or two
// requests at once, never creates a duplicate -- and never overwrites an
// entry the admin has since edited or voided.
export const generateDueRecurringExpenses = async (now = new Date()) => {
  const templates = await RecurringExpense.find({ isActive: true }).lean();
  const today = istParts(now);
  let created = 0;

  for (const template of templates) {
    const start = istParts(template.startDate);
    const amount =
      template.billing === "yearly-spread" ? round2(template.amount / 12) : template.amount;

    let y = start.y;
    let m = start.m;

    while (y < today.y || (y === today.y && m <= today.m)) {
      const date = entryDateFor(template, y, m);

      // Due from the START of its calendar day in India. Compare calendar
      // days, not instants: `date` is stored at noon IST, so an instant
      // comparison would make a charge on the 28th appear ~12 hours late.
      if (y === today.y && m === today.m && istParts(date).d > today.d) break;
      if (template.endDate && date > template.endDate) break;

      try {
        const result = await Expense.updateOne(
          { recurringTemplate: template._id, periodKey: `${y}-${pad(m)}` },
          {
            $setOnInsert: {
              date,
              category: template.category,
              amount,
              vendor: template.vendor,
              note: template.note || `Recurring: ${template.name}`,
              paymentMode: template.paymentMode,
            },
          },
          { upsert: true },
        );

        if (result.upsertedCount) created += 1;
      } catch (error) {
        // A concurrent request won the race to insert the same period --
        // exactly the case the unique index exists for.
        if (error.code !== 11000) throw error;
      }

      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  return created;
};
