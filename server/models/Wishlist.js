import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // Snapshotted when added — compared against the product's current
    // price to detect a drop worth alerting the customer about.
    priceWhenAdded: {
      type: Number,
      default: null,
    },

    // The price we last actually sent an alert for, so the price-drop
    // cron doesn't re-notify every run for the same still-lower price —
    // only when it drops again below whatever we last alerted at.
    lastAlertedPrice: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Prevent duplicate wishlist items
wishlistSchema.index({ user: 1, product: 1 }, { unique: true });

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

export default Wishlist;
