import Article from "../models/Article.js";
import { deleteCloudinaryAssetsByUrl } from "../utils/cloudinaryCleanup.js";
import { sanitizeArticleContent } from "../utils/sanitizeArticleContent.js";
import { escapeRegex } from "../utils/escapeRegex.js";

const generateSlug = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Inline <img src="..."> uploads (uploadArticleImage below) get their
// Cloudinary URL written straight into the Quill-authored HTML string by
// the admin editor's insertEmbed call -- there's no separate join table
// or image collection tracking them. The only way to know what's actually
// embedded in a given article is to pull the src values back out of the
// stored HTML itself.
const extractContentImageUrls = (html) => {
  const urls = [];
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html || ""))) {
    urls.push(match[1]);
  }
  return urls;
};

// ============================
// Get All Articles (Public)
// ============================
export const getArticles = async (req, res) => {
  try {
    const articles = await Article.find({ isActive: true })
      .select("title slug excerpt titleHi excerptHi coverImage createdAt updatedAt")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      articles,
    });
  } catch (error) {
    console.error("Get Articles Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Single Article By Slug (Public)
// ============================
export const getArticleBySlug = async (req, res) => {
  try {
    const article = await Article.findOne({
      slug: req.params.slug,
      isActive: true,
    }).populate("category", "name nameHi slug");

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    res.status(200).json({
      success: true,
      article,
    });
  } catch (error) {
    console.error("Get Article Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get All Articles (Admin — includes inactive)
// ============================
export const getAllArticlesAdmin = async (req, res) => {
  try {
    const filter = {};

    const { search } = req.query;
    // typeof guard: a bracket-shaped query param (?search[$ne]=null)
    // parses to an object, not a string, and .trim() would throw.
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.title = regex;
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const allowedSortFields = ["title", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const total = await Article.countDocuments(filter);

    const articles = await Article.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      articles,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error("Get Articles Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Single Article By Id (Admin)
// ============================
export const getArticleById = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    res.status(200).json({
      success: true,
      article,
    });
  } catch (error) {
    console.error("Get Article Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Upload Article Image (Admin)
// Uploads an image for use as a cover or inside article content and
// returns its hosted URL. No DB record is created.
// ============================
export const uploadArticleImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    res.status(200).json({
      success: true,
      url: req.file.path,
    });
  } catch (error) {
    console.error("Upload Article Image Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Add Article (Admin)
// ============================
export const addArticle = async (req, res) => {
  try {
    const {
      title,
      excerpt,
      content,
      titleHi,
      excerptHi,
      contentHi,
      coverImage,
      category,
      isActive,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    const slug = generateSlug(title);

    const existing = await Article.findOne({ slug });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "An article with this title already exists",
      });
    }

    const article = await Article.create({
      title,
      slug,
      excerpt: excerpt || "",
      content: sanitizeArticleContent(content),
      titleHi: titleHi || "",
      excerptHi: excerptHi || "",
      contentHi: sanitizeArticleContent(contentHi),
      coverImage: coverImage || "",
      category: category || null,
      isActive: isActive === undefined ? true : isActive === true || isActive === "true",
    });

    res.status(201).json({
      success: true,
      message: "Article added successfully",
      article,
    });
  } catch (error) {
    console.error("Add Article Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Update Article (Admin)
// ============================
export const updateArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    const {
      title,
      excerpt,
      content,
      titleHi,
      excerptHi,
      contentHi,
      coverImage,
      category,
      isActive,
    } = req.body;

    // Captured before either field is mutated below -- an edit that only
    // touches `content` leaves `contentHi` (and its own images) completely
    // untouched, so both language fields' PRE-edit state is needed to
    // compute what actually disappeared, not just what one field changed to.
    const oldImageUrls = new Set([
      ...extractContentImageUrls(article.content),
      ...extractContentImageUrls(article.contentHi),
    ]);

    if (title && title !== article.title) {
      article.title = title;
      article.slug = generateSlug(title);
    }

    if (excerpt !== undefined) article.excerpt = excerpt;
    if (content !== undefined) article.content = sanitizeArticleContent(content);
    if (titleHi !== undefined) article.titleHi = titleHi;
    if (excerptHi !== undefined) article.excerptHi = excerptHi;
    if (contentHi !== undefined)
      article.contentHi = sanitizeArticleContent(contentHi);
    // "" from a cleared <select> means "no category" -- both undefined
    // (field not sent) and "" need distinct handling, so this can't
    // reuse the `!== undefined` pattern the other optional fields use.
    if (category !== undefined) article.category = category || null;

    let oldCoverImage = null;
    if (coverImage !== undefined && coverImage !== article.coverImage) {
      oldCoverImage = article.coverImage;
      article.coverImage = coverImage;
    }

    if (isActive !== undefined)
      article.isActive = isActive === true || isActive === "true";

    await article.save();

    // Union across BOTH language fields on each side (not a per-field
    // diff) -- an image reused in both content and contentHi that only
    // gets dropped from one of them must not be deleted while the other
    // field still renders it. Only a URL genuinely absent from the
    // article's current state in either language is actually orphaned.
    const newImageUrls = new Set([
      ...extractContentImageUrls(article.content),
      ...extractContentImageUrls(article.contentHi),
    ]);
    const removedImageUrls = [...oldImageUrls].filter((url) => !newImageUrls.has(url));

    if (oldCoverImage || removedImageUrls.length > 0) {
      await deleteCloudinaryAssetsByUrl(
        [oldCoverImage, ...removedImageUrls].filter(Boolean),
      );
    }

    res.status(200).json({
      success: true,
      message: "Article updated successfully",
      article,
    });
  } catch (error) {
    console.error("Update Article Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Delete Article (Admin)
// ============================
export const deleteArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    await article.deleteOne();

    // Cover image plus every inline image ever embedded in either
    // language's content -- the whole article is gone, so none of these
    // can still be referenced from anywhere else (see extractContentImageUrls
    // above). deleteCloudinaryAssetsByUrl already dedupes and no-ops on
    // anything that isn't a real Cloudinary URL, so passing the raw,
    // possibly-overlapping list from both fields is safe.
    await deleteCloudinaryAssetsByUrl([
      article.coverImage,
      ...extractContentImageUrls(article.content),
      ...extractContentImageUrls(article.contentHi),
    ]);

    res.status(200).json({
      success: true,
      message: "Article deleted successfully",
    });
  } catch (error) {
    console.error("Delete Article Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
