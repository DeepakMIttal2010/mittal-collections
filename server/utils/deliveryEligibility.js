import * as Sentry from "@sentry/node";
import PincodeLookup from "../models/PincodeLookup.js";
import { ALLOWED_DELIVERY_STATES } from "../config/delivery.js";

const PINCODE_API_BASE = "https://api.postalpincode.in/";

// Customer-facing messages for each reason a PIN can't be ordered to.
export const DELIVERY_UNAVAILABLE_MESSAGES = {
  invalid: {
    en: "Please enter a valid 6-digit PIN code.",
    hi: "कृपया सही 6 अंकों का पिन कोड डालें।",
  },
  not_serviceable: {
    en: "Sorry, delivery is currently unavailable at this PIN code. We are currently serving selected locations in Uttar Pradesh. We are working to expand our delivery locations.",
    hi: "क्षमा करें, इस पिन कोड पर अभी डिलीवरी उपलब्ध नहीं है। हम अभी उत्तर प्रदेश के चुनिंदा स्थानों पर डिलीवरी करते हैं। हम अपनी डिलीवरी का दायरा बढ़ाने पर काम कर रहे हैं।",
  },
  ambiguous: {
    en: "We couldn't confirm the state for this PIN code. Please contact us before placing this order.",
    hi: "हम इस पिन कोड का राज्य पक्का नहीं कर पाए। कृपया ऑर्डर देने से पहले हमसे संपर्क करें।",
  },
  unverified: {
    en: "We couldn't verify this PIN code right now. Please try again shortly.",
    hi: "हम अभी इस पिन कोड की जाँच नहीं कर पाए। कृपया थोड़ी देर बाद फिर कोशिश करें।",
  },
};

const normalizeState = (state) => (typeof state === "string" ? state.trim().toLowerCase() : "");

// The configured list, cleaned. Anything malformed or empty means no
// state is deliverable (fail closed) and is reported, never "all states".
export const getAllowedDeliveryStates = (configured = ALLOWED_DELIVERY_STATES) => {
  const states = Array.isArray(configured)
    ? configured.map(normalizeState).filter(Boolean)
    : [];

  if (states.length === 0) {
    const message = "Delivery configuration error: ALLOWED_DELIVERY_STATES is empty or invalid — all website orders are blocked";
    console.error(message);
    Sentry.captureMessage(message, "error");
  }

  return states;
};

export const normalizePincode = (pincode) => {
  const value = typeof pincode === "string" ? pincode.trim() : typeof pincode === "number" ? String(pincode) : "";
  return /^\d{6}$/.test(value) ? value : null;
};

// One India Post call. Returns { state, district } for a clean answer,
// { ambiguous: true } when the post offices span more than one state,
// { notFound: true } for a well-formed "no such PIN" answer, and throws
// for anything else (network error, timeout, bad JSON, odd shape) — the
// caller treats a throw as "unverified" and never caches it.
const fetchIndiaPost = async (pincode) => {
  // Built via the URL constructor with a fixed base (same request-forgery
  // safe pattern as deliveryController.resolveFastDelivery).
  const url = new URL(`pincode/${encodeURIComponent(pincode)}`, PINCODE_API_BASE);
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });

  if (!response.ok) throw new Error(`India Post HTTP ${response.status}`);

  const data = await response.json();
  const result = Array.isArray(data) ? data[0] : null;

  if (!result || typeof result.Status !== "string") throw new Error("India Post: malformed response");

  if (result.Status !== "Success") {
    // "Error" with no post offices is India Post's normal "unknown PIN".
    if (result.Status === "Error" && !result.PostOffice?.length) return { notFound: true };
    throw new Error(`India Post: unexpected status ${result.Status}`);
  }

  const offices = Array.isArray(result.PostOffice) ? result.PostOffice : [];
  if (offices.length === 0) throw new Error("India Post: success with no post offices");

  const states = offices.map((office) => (typeof office?.State === "string" ? office.State.trim() : ""));
  if (states.some((state) => !state)) throw new Error("India Post: post office without a state");

  if (new Set(states.map(normalizeState)).size > 1) return { ambiguous: true };

  return {
    state: states[0],
    district: typeof offices[0].District === "string" ? offices[0].District.trim() : "",
  };
};

const cachedLookup = async (pincode) => {
  const entry = await PincodeLookup.findOne({ pincode: { $eq: pincode } }).lean();
  return entry ? { state: entry.state, district: entry.district } : null;
};

const decide = (pincode, lookup, allowedStates, source) => {
  const eligible = allowedStates.includes(normalizeState(lookup.state));
  return {
    eligible,
    pincode,
    state: lookup.state,
    district: lookup.district,
    reason: eligible ? null : "not_serviceable",
    source,
  };
};

const ineligible = (pincode, reason) => ({ eligible: false, pincode, state: null, district: null, reason, source: null });

// Whether website orders may be delivered to this PIN.
//   { eligible, pincode, state, district, reason, source }
// reason: null | "invalid" | "not_serviceable" | "ambiguous" | "unverified"
// source: "cache" | "india_post" | null
//
// cacheOnly (payment paths, the admin order list) never calls India Post:
// a PIN missing from the cache is "unverified". Otherwise the cache is
// tried first, then India Post; a clean answer is cached. When India Post
// fails and there is no cache entry the answer is "unverified" — the
// state is never guessed from the PIN's digits.
export const checkDeliveryEligibility = async (pincode, { cacheOnly = false } = {}) => {
  const pin = normalizePincode(pincode);
  if (!pin) return ineligible(null, "invalid");

  const allowedStates = getAllowedDeliveryStates();

  const cached = await cachedLookup(pin);
  if (cached) return decide(pin, cached, allowedStates, "cache");
  if (cacheOnly) return ineligible(pin, "unverified");

  let lookup;

  try {
    lookup = await fetchIndiaPost(pin);
  } catch (error) {
    console.error(`[delivery] India Post lookup failed for ${pin}:`, error.message);
    return ineligible(pin, "unverified");
  }

  if (lookup.notFound) return ineligible(pin, "invalid");
  if (lookup.ambiguous) return ineligible(pin, "ambiguous");

  // Only a clean single-state answer reaches here; a failed cache write
  // never fails the check itself.
  await PincodeLookup.updateOne(
    { pincode: pin },
    { $set: { state: lookup.state, district: lookup.district, verifiedAt: new Date() } },
    { upsert: true },
  ).catch((error) => console.error(`[delivery] caching PIN ${pin} failed:`, error.message));

  return decide(pin, lookup, allowedStates, "india_post");
};

// Cache-only checks for many PINs in one query (admin order list).
// Returns a Map pincode -> { eligible, state, reason }.
export const checkCachedEligibilityBatch = async (pincodes) => {
  const pins = [...new Set(pincodes.map(normalizePincode).filter(Boolean))];
  const allowedStates = getAllowedDeliveryStates();
  const entries = pins.length
    ? await PincodeLookup.find({ pincode: { $in: pins } }).select("pincode state").lean()
    : [];
  const byPin = new Map(entries.map((entry) => [entry.pincode, entry]));
  const result = new Map();

  for (const pin of pins) {
    const entry = byPin.get(pin);
    result.set(
      pin,
      entry
        ? {
            eligible: allowedStates.includes(normalizeState(entry.state)),
            state: entry.state,
            reason: allowedStates.includes(normalizeState(entry.state)) ? null : "not_serviceable",
          }
        : { eligible: false, state: null, reason: "unverified" },
    );
  }

  return result;
};

export const deliveryUnavailableMessage = (reason) =>
  (DELIVERY_UNAVAILABLE_MESSAGES[reason] || DELIVERY_UNAVAILABLE_MESSAGES.not_serviceable).en;
