import mongoose from "mongoose";

// One row = one "Top Trending" section on the homepage / /trending page
// for a given category. Mirrors NewArrivalsSection — a standalone
// admin-curated list of categories + order, not a flag on Category.
// Which *products* show inside each section still comes from the
// existing per-product isTrending/trendingRank fields (set from the
// product's own Edit page) — this collection only controls which
// categories get a section and in what order.
const trendingSectionSchema = new mongoose.Schema(
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

const TrendingSection = mongoose.model(
  "TrendingSection",
  trendingSectionSchema,
);

export default TrendingSection;
