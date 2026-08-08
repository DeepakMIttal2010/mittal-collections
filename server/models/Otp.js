import mongoose from "mongoose";

// One-time codes for email verification. `payload` carries whatever
// data the purpose needs once verified (e.g. the full pending
// registration, password already hashed) — nothing is written to the
// real User collection until the code is confirmed.
const otpSchema = new mongoose.Schema({
  target: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },

  purpose: {
    type: String,
    enum: ["register"],
    required: true,
  },

  otpHash: {
    type: String,
    required: true,
  },

  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },

  attempts: {
    type: Number,
    default: 0,
  },

  expiresAt: {
    type: Date,
    required: true,
  },
});

otpSchema.index({ target: 1, purpose: 1 });
// TTL index — MongoDB auto-deletes the document once expiresAt passes,
// so unused/expired codes never pile up.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Otp = mongoose.model("Otp", otpSchema);

export default Otp;
