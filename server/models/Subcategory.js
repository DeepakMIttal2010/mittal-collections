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

const Subcategory = mongoose.model("Subcategory", subcategorySchema);

export default Subcategory;
