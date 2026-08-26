import mongoose from "mongoose";

// A lightweight mirror of a customer's cart, kept only so the backend can
// detect abandoned carts (logged-in users only — no email to remind a
// guest with) and report product-wise cart-engagement counts. The actual
// cart UI still reads from localStorage — this is write-only from the
// frontend's perspective.
//
// Exactly one of user / visitorId is set, never both: a logged-in
// customer's snapshot is keyed by user (see cartController.js's
// syncCart), a guest's by the same anonymous localStorage id
// VisitTracker uses for page views (see syncGuestCart). Both are
// sparse-unique, which only excludes a document where the field is
// genuinely absent — not one explicitly set to null, which a sparse
// index still treats as a real (colliding) value. So deliberately no
// `default: null` here: leave whichever field doesn't apply truly
// unset, don't let Mongoose fill it in as an explicit null.
const cartSnapshotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    visitorId: {
      type: String,
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

cartSnapshotSchema.index({ user: 1 }, { unique: true, sparse: true });
cartSnapshotSchema.index({ visitorId: 1 }, { unique: true, sparse: true });

const CartSnapshot = mongoose.model("CartSnapshot", cartSnapshotSchema);

export default CartSnapshot;
