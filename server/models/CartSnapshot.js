import mongoose from "mongoose";

// A lightweight mirror of a logged-in user's cart, kept only so the
// backend can detect abandoned carts and send a reminder email. The
// actual cart UI still reads from localStorage — this is write-only
// from the frontend's perspective.
const cartSnapshotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: String,
        image: String,
        price: Number,
        quantity: Number,
      },
    ],

    reminderSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const CartSnapshot = mongoose.model("CartSnapshot", cartSnapshotSchema);

export default CartSnapshot;
