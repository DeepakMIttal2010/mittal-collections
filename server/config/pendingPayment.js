// Timings for unpaid Razorpay orders (see orderController.js's
// processPendingRazorpayOrders). Every value can be overridden with an env
// var; the defaults are the approved policy. Read on every cron run rather
// than once at import, so an env change on Render applies after the usual
// restart without code changes (and tests can override it per case).
const DEFAULTS = {
  reminder1Minutes: 30,
  reminder2Minutes: 180,
  autoCancelMinutes: 360,
  remindersEnabled: true,
  inFlightGraceMinutes: 30,
  checkMaxFailures: 6,
  postCancelRecheckHours: 72,
  batchSize: 50,
  reminderMaxAttempts: 3,
};

const positiveInt = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`Invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }

  return value;
};

export const getPendingPaymentConfig = () => {
  let reminder1Minutes = positiveInt("PAYMENT_REMINDER_1_MINUTES", DEFAULTS.reminder1Minutes);
  let reminder2Minutes = positiveInt("PAYMENT_REMINDER_2_MINUTES", DEFAULTS.reminder2Minutes);

  if (reminder2Minutes <= reminder1Minutes) {
    console.error(
      `PAYMENT_REMINDER_2_MINUTES (${reminder2Minutes}) must be after PAYMENT_REMINDER_1_MINUTES (${reminder1Minutes}) — using defaults for both`,
    );
    reminder1Minutes = DEFAULTS.reminder1Minutes;
    reminder2Minutes = DEFAULTS.reminder2Minutes;
  }

  // The cancel window is validated on its own: a reminder due at or after
  // it is simply never sent (cancellation is checked first), which is
  // what lets PAYMENT_AUTO_CANCEL_MINUTES=45 restore the old behaviour
  // without touching the reminder values.
  return {
    reminder1Minutes,
    reminder2Minutes,
    autoCancelMinutes: positiveInt("PAYMENT_AUTO_CANCEL_MINUTES", DEFAULTS.autoCancelMinutes),
    remindersEnabled: process.env.PAYMENT_REMINDERS_ENABLED !== "false",
    inFlightGraceMinutes: positiveInt("PAYMENT_IN_FLIGHT_GRACE_MINUTES", DEFAULTS.inFlightGraceMinutes),
    checkMaxFailures: positiveInt("PAYMENT_CHECK_MAX_FAILURES", DEFAULTS.checkMaxFailures),
    postCancelRecheckHours: positiveInt("POST_CANCEL_RECHECK_HOURS", DEFAULTS.postCancelRecheckHours),
    batchSize: positiveInt("PENDING_PAYMENT_BATCH_SIZE", DEFAULTS.batchSize),
    reminderMaxAttempts: positiveInt("PAYMENT_REMINDER_MAX_ATTEMPTS", DEFAULTS.reminderMaxAttempts),
  };
};
