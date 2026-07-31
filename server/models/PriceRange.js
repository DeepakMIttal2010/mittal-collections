import mongoose from "mongoose";

const priceRangeSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, "Label is required"],
      trim: true,
    },

    maxPrice: {
      type: Number,
      required: [true, "Max price is required"],
      min: 0,
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

const PriceRange = mongoose.model("PriceRange", priceRangeSchema);

export default PriceRange;
