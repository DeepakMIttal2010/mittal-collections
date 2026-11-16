import crypto from "crypto";

// Guest delivery-demand rows (PR-B2) are keyed by a hash of the browser's
// anonymous visitorId, so the raw id is never stored alongside a PIN.
export const hashVisitorId = (visitorId) =>
  crypto.createHash("sha256").update(`delivery-demand:${visitorId}`).digest("hex").slice(0, 32);

// Keyed hash (HMAC) of the client IP for one IST day. Keyed so the stored
// value can't be reversed by hashing every IPv4 address; per-day so the
// same network can't be followed across days. The raw IP is never stored.
export const hashClientIp = (ip, day) => {
  const secret = process.env.DELIVERY_DEMAND_HASH_SECRET || process.env.JWT_SECRET || "";
  return crypto
    .createHmac("sha256", `delivery-demand-ip:${secret}`)
    .update(`${day}|${String(ip || "").replace(/^::ffff:/, "")}`)
    .digest("hex")
    .slice(0, 40);
};
