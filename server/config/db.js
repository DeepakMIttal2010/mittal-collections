import mongoose from "mongoose";

import CartSnapshot from "../models/CartSnapshot.js";
import Wishlist from "../models/Wishlist.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

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
