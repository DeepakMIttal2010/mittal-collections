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
    // No `default: null` here — a sparse unique index only skips
    // documents where the field is genuinely absent. Mongoose would
    // otherwise write an explicit `null` into every document, which
    // *is* present for indexing purposes and defeats the sparse index
    // the moment a second such document is created.
    mobile: {
      type: String,
      unique: true,
      sparse: true,
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

const User = mongoose.model("User", userSchema);

export default User;
