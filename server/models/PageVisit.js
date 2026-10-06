import mongoose from "mongoose";

const pageVisitSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
    },

    visitorId: {
      type: String,
      required: true,
      index: true,
    },

    // Set only when the visitor was logged in at the time — lets the
    // admin see a specific customer's own browsing history (which
    // products they've actually looked at), not just anonymous
    // aggregate traffic. Visits recorded before this field existed, and
    // any from a visitor who wasn't logged in, have no user here.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    device: {
      type: String,
      enum: ["Mobile", "Tablet", "Desktop"],
      default: "Desktop",
    },

    country: {
      type: String,
      default: "",
    },

    region: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// TTL index — auto-deletes visits older than 1 year so this collection
// doesn't grow unbounded. Report queries only ever look back a bounded
// custom date range, so a year of retention is more than sufficient.
pageVisitSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);

// `path` had no index at all despite being the filter in
// getProductViewCount's `distinct("visitorId", {path, createdAt})`
// (analyticsController.js) — the product-page view-count badge, hit on
// every single public product-page load, the hottest page type on the
// site. The same unindexed-path cost also hits several admin dashboard
// aggregations that $match on path. Compound with createdAt (not a
// separate single-field index) since every real query here filters on
// both together, and a compound index already serves a path-only query
// too (Mongo can use a leading-prefix subset of a compound index).
pageVisitSchema.index({ path: 1, createdAt: 1 });

const PageVisit = mongoose.model("PageVisit", pageVisitSchema);

export default PageVisit;
