// Escapes regex-special characters in user-supplied search text before
// it's used inside `new RegExp(...)`. Without this, a search term like
// "(" or "*" throws (500s the request) and a term with genuine regex
// syntax could otherwise change what a search matches — not a NoSQL
// operator-injection risk (this is a string, not a query-shaped
// object), just a correctness/availability one.
export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
