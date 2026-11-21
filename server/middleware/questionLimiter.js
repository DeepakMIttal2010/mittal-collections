import rateLimit, { MemoryStore } from "express-rate-limit";

// Product questions (POST /api/questions) — admin audit QS-01.
//
// Two limiters with their OWN stores, deliberately not the shared
// emailTriggerLimiter: that one instance is the single 15/min/IP budget
// for tickets, contact, newsletter, stock alerts and delivery feedback, so
// putting questions on it would let question traffic eat into those
// routes' allowance. The per-day cap per account lives in the controller
// (counted in the DB, so it survives restarts); these are the fast,
// in-memory first line.
//
// DISABLE_AUTH_RATE_LIMIT is honoured like every other limiter (the e2e
// CI job sets it); the server-tests job does not.
const disabled = process.env.DISABLE_AUTH_RATE_LIMIT === "true";

const ipStore = new MemoryStore();
const accountStore = new MemoryStore();

// Runs BEFORE authMiddleware: cheap rejection of one IP hammering the
// route, whoever it claims to be.
export const questionIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: disabled ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: ipStore,
  message: {
    success: false,
    message: "Too many questions from this network. Please try again in a minute.",
  },
});

// Runs AFTER authMiddleware — keyed on the logged-in account, so it needs
// req.user.
export const questionAccountLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: disabled ? 10000 : 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: accountStore,
  keyGenerator: (req) => `user:${req.user._id}`,
  message: {
    success: false,
    message: "You've asked several questions just now. Please wait a few minutes before asking another.",
  },
});

// Test-only: every supertest request comes from the same IP, so the
// in-memory counts must be cleared between tests.
export const __resetQuestionLimitersForTests = () => {
  ipStore.resetAll();
  accountStore.resetAll();
};
