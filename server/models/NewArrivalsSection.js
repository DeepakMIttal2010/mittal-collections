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
      // Only ever one section per category, active or not — same
      // reasoning as TrendingSection.js. The app-level findOne
      // pre-check in the controller is the fast path; this is the true
      // concurrency backstop for two admins submitting the same
      // category at once.
      unique: true,
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
