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

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    button1Label: {
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
