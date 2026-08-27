import mongoose from "mongoose";

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    excerpt: {
      type: String,
      default: "",
      trim: true,
    },

    content: {
      type: String,
      required: [true, "Content is required"],
    },

    // Hindi versions, all optional — an article with these left blank
    // still works fine, it just has no separate /hi/articles/:slug page
    // (see getArticleBySlug/sitemap.js, which only surface a Hindi
    // version once titleHi is actually filled in, to avoid indexing a
    // page that's just the English content again under a different URL).
    titleHi: {
      type: String,
      default: "",
      trim: true,
    },

    excerptHi: {
      type: String,
      default: "",
      trim: true,
    },

    contentHi: {
      type: String,
      default: "",
    },

    coverImage: {
      type: String,
      default: "",
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

const Article = mongoose.model("Article", articleSchema);

export default Article;
