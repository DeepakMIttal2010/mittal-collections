import mongoose from "mongoose";

// Exactly one of user / visitorId is set, never both — a logged-in
// customer's wishlist item is keyed by user, a guest's by the same
// anonymous localStorage id VisitTracker/CartSnapshot use (see
// wishlistController.js's guest endpoints). Deliberately no `default:
// null` on either: a sparse index only excludes a field that's
// genuinely absent, not one explicitly set to null — see
// CartSnapshot.js's comment for the full story of why that distinction
// matters (an explicit null default silently made every second guest
// collide on a duplicate-key error there).
const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    visitorId: {
      type: String,
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

// Prevent duplicate wishlist items — separate unique compound indexes,
// each scoped with partialFilterExpression to only the documents where
// its own leading field actually exists. `sparse` was tried first, but
// for a COMPOUND index sparse only skips a doc when ALL indexed fields
// are missing — since `product` is always present, that never happens,
// so every guest doc (missing `user`) still landed in the {user,
// product} index as `user: null` and collided with every other guest's.
// partialFilterExpression's $exists check is what actually excludes
// them.
wishlistSchema.index(
  { user: 1, product: 1 },
  { unique: true, partialFilterExpression: { user: { $exists: true } } },
);
wishlistSchema.index(
  { visitorId: 1, product: 1 },
  { unique: true, partialFilterExpression: { visitorId: { $exists: true } } },
);

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

export default Wishlist;
