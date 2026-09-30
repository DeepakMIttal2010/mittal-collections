import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: [true, "Banner image is required"],
    },

    subtitle: {
      type: String,
      default: "",
      trim: true,
    },

    // Optional Hindi translations, same fallback-to-English convention as
    // Product's nameHi/descriptionHi. Hero.jsx has called t(slide.title,
    // slide.titleHi) (and the same for subtitle/description/both button
    // labels) since this component's original build -- these fields never
    // existed on the schema until now, so every hero banner has always
    // rendered English-only regardless of the site's language toggle,
    // silently, since Mongoose had nowhere to store a Hindi value at all.
    subtitleHi: {
      type: String,
      default: "",
      trim: true,
    },

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },

    titleHi: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    descriptionHi: {
      type: String,
      default: "",
      trim: true,
    },

    button1Label: {
      type: String,
      default: "",
      trim: true,
    },

    button1LabelHi: {
      type: String,
      default: "",
      trim: true,
    },

    button1Link: {
      type: String,
      default: "",
      trim: true,
    },

    button2Label: {
      type: String,
      default: "",
      trim: true,
    },

    button2LabelHi: {
      type: String,
      default: "",
      trim: true,
    },

    button2Link: {
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

const Banner = mongoose.model("Banner", bannerSchema);

export default Banner;
