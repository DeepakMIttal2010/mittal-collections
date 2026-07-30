import mongoose from "mongoose";

const footerLinkSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, "Label is required"],
      trim: true,
    },

    url: {
      type: String,
      required: [true, "URL is required"],
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

const FooterLink = mongoose.model("FooterLink", footerLinkSchema);

export default FooterLink;
