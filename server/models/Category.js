import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
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
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    image: {
      type: String,
      required: [true, "Category image is required"],
    },

    banner: {
      type: String,
      default: "",
    },

    featured: {
      type: Boolean,
      default: false,
    },

    // Nav/footer/homepage category order defaults to live product count
    // (deepest categories first) — see getCategories. Pinning is the
    // manual escape hatch: a pinned category ignores its product count
    // and sorts by displayOrder instead, ahead of every unpinned one.
    isPinned: {
      type: Boolean,
      default: false,
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

const Category = mongoose.model("Category", categorySchema);

export default Category;
