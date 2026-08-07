import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },

    slug: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },

    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },

    oldPrice: {
      type: Number,
      default: 0,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },

    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      default: null,
    },

    image: {
      type: String,
      required: [true, "Image is required"],
    },

    images: {
      type: [String],
      default: [],
    },

    videos: {
      type: [String],
      default: [],
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Optional specs — shown on the product page only when filled in,
    // never required so admins aren't blocked adding a product quickly.
    fabric: { type: String, default: "", trim: true },
    size: { type: String, default: "", trim: true },
    gsm: { type: String, default: "", trim: true },
    washCare: { type: String, default: "", trim: true },
    brand: { type: String, default: "", trim: true },
    countryOfOrigin: { type: String, default: "", trim: true },

    rating: {
      type: Number,
      default: 5,
      min: 0,
      max: 5,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    isTrending: {
      type: Boolean,
      default: false,
    },

    trendingRank: {
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

// Matches the common getProducts filter (category + subcategory,
// always scoped to isActive) and the default newest-first sort.
productSchema.index({ isActive: 1, category: 1 });
productSchema.index({ isActive: 1, subcategory: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });

const Product = mongoose.model("Product", productSchema);

export default Product;
