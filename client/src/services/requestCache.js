// Shared de-duplication/short-cache helper for GET endpoints that many
// independent components fetch on mount — a real Lighthouse network trace
// against production showed the homepage alone firing 43 API requests,
// with the same few endpoints (settings, categories, subcategories,
// rewards, banner coupon, geo-location) each duplicated 3-8x, all
// competing for the same Render free-tier instance and directly delaying
// LCP.
//
// A short TTL, not an infinite cache: several admin pages call
// getCategories()/getSubcategories() too, and an admin adding a category
// then immediately navigating to Add Product (same SPA session, no full
// reload) must see it — this only needs to survive the handful of
// milliseconds between several components' near-simultaneous mount-time
// fetches, not an entire session.
const DEFAULT_TTL_MS = 15000;

const cache = new Map(); // key -> { promise, expiresAt }

export function cachedFetchJson(key, fetchFn, ttlMs = DEFAULT_TTL_MS) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.promise;
  }

  const promise = fetchFn().catch((error) => {
    cache.delete(key); // don't let a real failure poison the cache
    throw error;
  });

  cache.set(key, { promise, expiresAt: Date.now() + ttlMs });

  return promise;
}
