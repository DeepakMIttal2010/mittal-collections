// getVisitorId() (client/src/utils/visitorId.js) always mints a
// crypto.randomUUID() value in production, but this codebase's own
// test fixtures use short human-readable ids (e.g. "guest-wishlist-a")
// for the same field — so this deliberately doesn't enforce the exact
// UUID shape. What actually matters for safety: it must be a plain
// string (an object here, e.g. {"$gt": ""}, would otherwise flow
// straight into a Mongo query as an operator instead of a literal
// value) and reasonably bounded in length (an unbounded string could
// otherwise reach a Mongo index key untruncated).
export const isValidVisitorId = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 100;
