import mongoose from "mongoose";

// Cache of India Post PIN lookups that came back clean: Status "Success",
// at least one post office, and every post office in the same state.
// Errors, timeouts, empty or multi-state answers are never stored, so a
// cache hit is always a verified answer. Lets checkout keep working for
// already-seen PINs while India Post is down, and lets the payment paths
// and the admin order list check eligibility without a live call.
const pincodeLookupSchema = new mongoose.Schema({
  pincode: {
    type: String,
    required: true,
    unique: true,
    match: /^\d{6}$/,
  },

  state: {
    type: String,
    required: true,
    trim: true,
  },

  district: {
    type: String,
    default: "",
    trim: true,
  },

  verifiedAt: {
    type: Date,
    required: true,
  },
});

// TTL index — MongoDB removes an entry roughly 90 days after it was
// verified (the TTL monitor runs about once a minute, so deletion is
// eventual, not exact), after which the next lookup re-verifies it.
pincodeLookupSchema.index({ verifiedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const PincodeLookup = mongoose.model("PincodeLookup", pincodeLookupSchema);

export default PincodeLookup;
