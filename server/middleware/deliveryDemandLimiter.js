import rateLimit from "express-rate-limit";

// The demand beacon is public (guests count too), so cap how many rows a
// single source can try to write. A real shopper sends a handful at most.
export const deliveryDemandLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again in a minute.",
  },
});
