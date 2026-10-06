import mongoose from "mongoose";

const searchLogSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    resultCount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// TTL index — auto-deletes searches older than 1 year so this collection
// doesn't grow unbounded. Report queries only ever look back a bounded
// custom date range, so a year of retention is more than sufficient.
searchLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);
// A `{query:1}` index used to live here too. Removed (2026-10-02 DB/API
// audit) — every read of this collection (adminController.js) only ever
// filters/groups by `createdAt`, never `query`, so it was pure write-time
// overhead with no query ever benefiting from it.

const SearchLog = mongoose.model("SearchLog", searchLogSchema);

export default SearchLog;
