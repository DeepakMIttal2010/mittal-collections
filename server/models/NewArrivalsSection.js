import mongoose from "mongoose";

// One row = one "New Arrivals" section on the homepage / /new-arrivals
// page for a given category, showing that category's newest products.
// Deliberately a standalone managed list (mirrors PriceRange) rather than
// a flag on Category, so it's admin-curated add/remove/reorder — the
// same pattern already used for "Shop by Price".
const newArrivalsSectionSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },

    displayOrder: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const NewArrivalsSection = mongoose.model(
  "NewArrivalsSection",
  newArrivalsSectionSchema,
);

export default NewArrivalsSection;
