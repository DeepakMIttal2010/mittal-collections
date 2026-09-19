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

    // TEMPORARY diagnostic fields (added 2026-09-19) — every visit today
    // is showing blank country/region/city despite geoip-lite resolving
    // real IPs correctly in isolation, which points to req.ip itself not
    // being the real visitor IP in production. These capture the raw
    // values so the actual bug can be confirmed from real traffic, then
    // get removed once it's found.
    debugIp: {
      type: String,
      default: "",
    },
    debugXff: {
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

const PageVisit = mongoose.model("PageVisit", pageVisitSchema);

export default PageVisit;
