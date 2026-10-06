import rateLimit from "express-rate-limit";

// multer buffers the whole file in RAM before this middleware chain even
// finishes (memoryStorage, see uploadMiddleware.js), and every upload is
// then decoded/re-encoded (sharp) or streamed to Cloudinary — real CPU +
// memory work per request, unlike most routes the app-wide 300/min
// limiter (app.js) is sized for. Review media (uploadReviewMedia) is the
// most exposed case: reachable by any authenticated (self-registerable)
// customer, up to 3 images + 1 video at 15MB/file. Applied only to the
// specific customer-facing upload routes, not admin ones (curated
// product-media uploads are lower real-world risk and legitimately
// higher-frequency).
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many uploads. Please try again in a minute.",
  },
});
