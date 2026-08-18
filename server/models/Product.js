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

    // Optional Hindi translations — public product display falls back
    // to the English name/description whenever these are empty.
    nameHi: {
      type: String,
      default: "",
      trim: true,
    },

    descriptionHi: {
      type: String,
      default: "",
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

    // Required for a normal add/edit (enforced in the controller, since
    // multipart form validation doesn't belong in the schema) — but left
    // optional here so a duplicated product (see duplicateProduct) can
    // exist briefly without one, until the admin uploads real images.
    image: {
      type: String,
      default: "",
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

    // e.g. "Set of 5 Cushion Covers" or "1 Bedsheet + 2 Pillow Covers" —
    // shown as its own labeled line on the product page so a customer
    // doesn't have to parse the description paragraph to know exactly
    // what they're getting.
    whatsIncluded: { type: String, default: "", trim: true },

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

    // Defaults true — every product shows in "New Arrivals" out of the
    // box, but an admin can uncheck this for a specific product (e.g. a
    // bulk-imported or backdated listing) without it ever needing to
    // show up there.
    showInNewArrivals: {
      type: Boolean,
      default: true,
    },

    // Defaults true — most products get restocked, so once stock hits 0
    // they still show (deprioritized to the end of listings) with a
    // "Notify Me" option. An admin can mark a one-off/discontinued
    // product as false so it disappears from the storefront entirely
    // the moment it sells out, instead of lingering with a dead
    // "Notify Me" form nobody should bother filling in.
    willRestock: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Where this product is allowed to be sold — "both" (default) shows it
    // on the storefront and lets POS sell it in-store; "online" hides it
    // from POS; "offline" hides it from the public storefront entirely
    // (still sellable in-store via POS/QR scan).
    visibility: {
      type: String,
      enum: ["both", "online", "offline"],
      default: "both",
    },

    isReturnable: {
      type: Boolean,
      default: true,
    },

    // Overrides the site-wide default return window for this specific
    // product. 0/unset means "use SiteSettings.defaultReturnPeriodDays".
    returnPeriodDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Off by default — every product already gets a generic low-stock
    // alert at the site-wide threshold (see LOW_STOCK_THRESHOLD in
    // adminController.js). This lets an admin opt a specific product
    // into its own restock quantity instead (e.g. a fast seller that
    // needs reordering well before it actually runs low).
    restockAlertEnabled: {
      type: Boolean,
      default: false,
    },

    // Only meaningful when restockAlertEnabled is true.
    restockAlertQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Internal cost accounting — never returned by any public product
    // endpoint (see productController's public routes, which strip
    // these). Used only in the admin panel and to derive the printed
    // label's secret code (see utils/costCipher.js).
    purchasePrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    purchaseDate: {
      type: Date,
      default: Date.now,
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
