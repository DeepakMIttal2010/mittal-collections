import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Not schema-required: enforced at the controller level for normal
    // email/password registration, but Google sign-in creates a user
    // before a mobile number is collected (Google doesn't provide one).
    // No `default: null` here — an absent field is required for the
    // partial unique index below to skip these documents. Mongoose
    // would otherwise write an explicit `null` into every document,
    // which the index's own field-existence check would then reject
    // anyway, but leaving it genuinely unset is simpler and correct.
    mobile: {
      type: String,
      trim: true,
    },

    // Absent entirely for Google-sign-in-only accounts.
    password: {
      type: String,
      minlength: 6,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // True only once confirmed — via the registration OTP flow, or
    // because Google already verified it for us. Accounts that existed
    // before this field was added are grandfathered true by a one-off
    // migration rather than defaulting new, unconfirmed signups to true.
    emailVerified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    loyaltyPoints: {
      type: Number,
      default: 0,
    },

    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    referralRewarded: {
      type: Boolean,
      default: false,
    },

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpire: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Mobile numbers only need to be unique among customers — an admin's
// own number (they may also shop as a customer) shouldn't block a
// customer account from using the same number. Scoped as a partial
// index rather than a plain sparse one for exactly that reason.
userSchema.index(
  { mobile: 1 },
  {
    unique: true,
    partialFilterExpression: { role: "user", mobile: { $type: "string" } },
  },
);

const User = mongoose.model("User", userSchema);

export default User;
