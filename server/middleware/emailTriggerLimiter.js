import rateLimit from "express-rate-limit";

// Ticket creation/reply, contact-form submission, and newsletter
// signup each fire an outbound email (to the admin on a new
// ticket/message, or as part of the subscribe flow) on every
// successful POST — the app-wide 300/min limiter (app.js) is generous
// enough that it doesn't meaningfully guard against using one of these
// as a mail-bombing/quota-exhaustion vector against the same Brevo
// sender OTP/order/password-reset mail also goes through. Applied only
// to the specific public/email-triggering routes in each router (not
// the whole path via app.use), since the admin-only routes sharing
// these same route files (ticket status updates, message moderation,
// campaign sending) are legitimate higher-frequency admin usage that
// shouldn't share this tighter budget.
export const emailTriggerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 10000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again in a minute.",
  },
});
