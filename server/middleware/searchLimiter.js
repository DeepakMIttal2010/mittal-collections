import rateLimit from "express-rate-limit";

// Levenshtein-based fuzzy matching (server/utils/fuzzySearch.js) runs
// against the full catalog on every search request — the query-length
// cap added alongside this (deep bug sweep, 2026-10-20) bounds the CPU
// cost of any ONE request, but does nothing to bound how many of those
// requests a single source can fire per minute, and both /products
// (?search=) and /products/suggestions are public, unauthenticated, with
// no throttle beyond the app-wide 300/min budget — generous enough that
// a script could still keep the catalog-wide scoring loop running
// near-continuously. getSearchSuggestions is always search-triggered
// (autocomplete), so this applies unconditionally there; getProducts
// also serves plain category/listing browsing with no search param at
// all, which is normal high-frequency traffic that shouldn't share this
// tighter budget — `skip` only engages the limiter when `?search=` is
// actually present.
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.query.search,
  message: {
    success: false,
    message: "Too many search requests. Please try again in a minute.",
  },
});

export const suggestionsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many search requests. Please try again in a minute.",
  },
});
