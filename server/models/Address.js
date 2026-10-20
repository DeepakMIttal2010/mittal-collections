import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    mobile: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },

    address: {
      type: String,
      required: [true, "Street address is required"],
      trim: true,
    },

    unit: {
      type: String,
      default: "",
      trim: true,
    },

    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },

    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },

    pincode: {
      type: String,
      required: [true, "ZIP code is required"],
      trim: true,
    },

    country: {
      type: String,
      default: "India",
      trim: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    // Soft-delete flag — a deleted address is never actually removed
    // from the database, just hidden from "pick an address" pickers.
    // Existing orders never need this: shippingAddress above is a full
    // embedded snapshot taken at order time, not a live reference, so
    // a past order's displayed address is already unaffected either way.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Enforces "at most one default address per user" at the DB level —
// the controller logic unsets every other address's isDefault before
// setting the new one, but that's still two separate writes with a gap
// between them, so two near-simultaneous requests (double-click, two
// tabs) could otherwise both pass the "unset others" step and both end
// up isDefault:true. This partial unique index makes the second write
// to commit fail with a duplicate-key error instead of silently leaving
// two defaults, so the controllers can catch that specific case rather
// than relying on write ordering alone (deep bug sweep, 2026-10-20).
addressSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { isDefault: true, isActive: true } },
);

const Address = mongoose.model("Address", addressSchema);

export default Address;
