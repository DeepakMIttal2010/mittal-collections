import crypto from "crypto";

// Subscriber has no password/login (see Subscriber.js — just an email),
// so a newsletter unsubscribe link can't require auth the way every
// other "do something to my account" action in this app does. An HMAC
// of the email itself (keyed on JWT_SECRET, already the one signing
// secret this app trusts) lets the link prove "this really came from
// an email we sent to this address" without storing a separate token
// per subscriber or requiring the visitor to log in at all.
export const createUnsubscribeToken = (email) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(email.toLowerCase().trim())
    .digest("hex");

// timingSafeEqual throws on a length mismatch rather than returning
// false -- a malformed/missing token query param is an everyday case
// here (not an attack), so that's caught and treated as simply invalid
// rather than letting it 500.
export const isValidUnsubscribeToken = (email, token) => {
  if (!email || !token) return false;

  const expected = createUnsubscribeToken(email);

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
};
