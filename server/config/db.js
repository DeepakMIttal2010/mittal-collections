import mongoose from "mongoose";
import * as Sentry from "@sentry/node";

import CartSnapshot from "../models/CartSnapshot.js";
import Wishlist from "../models/Wishlist.js";

// Previously had zero visibility into connection drops/reconnects — on
// Render's free tier (the instance idles down and cold-starts) and
// Atlas's free M0 tier (which can drop idle connections on its own),
// the underlying driver reconnects automatically, but any request that
// lands exactly during that gap fails with no signal anywhere about
// *why* — it just looked like a random, unexplained customer-facing
// error. These listeners don't change the reconnect behavior (the
// driver already retries on its own); they make it visible in Sentry
// so a real pattern (vs. one-off network blips) can actually be seen.
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected — driver will attempt to reconnect");
  Sentry.captureMessage("MongoDB disconnected", "warning");
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("❌ MongoDB connection error:", error.message);
  Sentry.captureException(error);
});

const connectDB = async () => {
  try {
    // serverSelectionTimeoutMS: how long a query will buffer/wait for a
    // usable connection before failing outright. The driver default
    // (30s) left a slow-failing request hanging far longer than any
    // customer would wait before giving up anyway — 10s surfaces a real
    // outage as a fast, clear error instead of an unexplained hang.
    // socketTimeoutMS: kills a socket that's gone idle/silent without
    // officially erroring, which is the exact "random, no pattern"
    // failure mode a dropped-but-not-yet-detected connection produces.
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // One-time self-healing migration: CartSnapshot.user used to be a
    // required, plain-unique field (one snapshot per logged-in user).
    // It's now optional (nullable for guest snapshots keyed by visitorId
    // instead — see the model's own comment), with sparse-unique indexes
    // on both. Mongoose's normal autoIndex only ever *adds* missing
    // indexes; it won't replace the old non-sparse "user_1" with the new
    // sparse one, which would otherwise reject every guest snapshot after
    // the first with a duplicate-key error on { user: null }. syncIndexes
    // reconciles the collection's real indexes against the schema
    // (dropping stale ones, creating missing ones) — cheap and safe to
    // run on every boot once already converged, so it just stays here.
    await CartSnapshot.syncIndexes();
    // Same story as CartSnapshot above — Wishlist.user went from
    // required+plain-unique(with product) to optional+sparse-unique, to
    // let a guest's wishlist item (keyed by visitorId instead) exist
    // alongside others without colliding on an absent user.
    await Wishlist.syncIndexes();
  } catch (error) {
    console.error("❌ MongoDB Connection Failed");
    console.error(error.message);
    process.exit(1);
  }
};

export default connectDB;
