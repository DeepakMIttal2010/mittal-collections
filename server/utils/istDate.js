// A "YYYY-MM-DD" string from an admin date picker (or the "Today"/
// "Yesterday" quick filters) means that calendar day in India Standard
// Time — the store's own timezone — not whatever timezone the Node
// process happens to be running in. `new Date(dateStr); d.setHours(0,0,0,0)`
// computed the day boundary in the PROCESS's local timezone (UTC on
// Render, with no TZ env var set), so for roughly 00:00-05:29 IST every
// day, "Today" silently meant the wrong calendar day. Building the
// boundary directly from an explicit +05:30 offset sidesteps the
// process timezone entirely, so this is correct no matter where it runs.

// Start of the given YYYY-MM-DD date, IST.
export const istDayStart = (dateStr) => new Date(`${dateStr}T00:00:00+05:30`);

// End of the given YYYY-MM-DD date, IST.
export const istDayEnd = (dateStr) => new Date(`${dateStr}T23:59:59.999+05:30`);

// Today's date in IST, as YYYY-MM-DD — computed from the current UTC
// timestamp shifted by the fixed +05:30 offset, so (like the two
// functions above) this is correct no matter what timezone the Node
// process itself is running in. For a "last N days" preset that isn't
// given an explicit startDate/endDate from a date picker.
export const istTodayString = () =>
  new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// `days` calendar days before today, IST, as YYYY-MM-DD.
export const istDaysAgoString = (days) => {
  const [y, m, d] = istTodayString().split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  target.setUTCDate(target.getUTCDate() - days);
  return target.toISOString().slice(0, 10);
};
