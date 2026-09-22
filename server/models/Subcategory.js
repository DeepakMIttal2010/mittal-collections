import mongoose from "mongoose";

const subcategorySchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Parent category is required"],
    },

    // Group heading jaise "By Size", "By Occasion", "By Fabric"
    groupLabel: {
      type: String,
      required: [true, "Group label is required"],
      trim: true,
    },

    // Item ka naam jaise "Single Bed Sheets", "Double Bed Sheets"
    name: {
      type: String,
      required: [true, "Subcategory name is required"],
      trim: true,
    },

    // Optional Hindi translation — public display falls back to `name`
    // whenever this is empty.
    nameHi: {
      type: String,
      default: "",
      trim: true,
    },

    slug: {
      type: String,
      required: [true, "Slug is required"],
      lowercase: true,
      trim: true,
    },

    image: {
      type: String,
      default: "",
    },

    // Chhoti si extra line jaise size dimensions — "60\" X 90\""
    subtitle: {
      type: String,
      default: "",
      trim: true,
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

// Scoped to the parent category (not global, unlike Category's own
// name/slug uniqueness) — the same subcategory name legitimately repeats
// across different categories (e.g. a "Small" size subcategory under both
// Bedsheets and Curtains), but two identical entries under the SAME
// category were previously createable with no guard at all.
subcategorySchema.index({ category: 1, slug: 1 }, { unique: true });

const Subcategory = mongoose.model("Subcategory", subcategorySchema);

export default Subcategory;
