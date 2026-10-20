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

    // Previously had no Hindi equivalent at all -- every Hindi category
    // page (the highest-authority page type on the site) rendered blank
    // or fell back to this English description regardless of the URL's
    // language, a real contributor to why Hindi pages are so much more
    // under-indexed than their English equivalents (SEO/conversion
    // audit, 2026-10-20). Falls back to `description` the same way
    // `nameHi` falls back to `name` above.
    descriptionHi: {
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
