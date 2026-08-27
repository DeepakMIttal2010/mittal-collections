import Article from "../models/Article.js";
import { deleteCloudinaryAssetsByUrl } from "../utils/cloudinaryCleanup.js";

const generateSlug = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ============================
// Get All Articles (Public)
// ============================
export const getArticles = async (req, res) => {
  try {
    const articles = await Article.find({ isActive: true })
      .select("title slug excerpt titleHi excerptHi coverImage createdAt")
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
    });

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
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
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
    const { title, excerpt, content, titleHi, excerptHi, contentHi, coverImage, isActive } =
      req.body;

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
      content,
      titleHi: titleHi || "",
      excerptHi: excerptHi || "",
      contentHi: contentHi || "",
      coverImage: coverImage || "",
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

    const { title, excerpt, content, titleHi, excerptHi, contentHi, coverImage, isActive } =
      req.body;

    if (title && title !== article.title) {
      article.title = title;
      article.slug = generateSlug(title);
    }

    if (excerpt !== undefined) article.excerpt = excerpt;
    if (content !== undefined) article.content = content;
    if (titleHi !== undefined) article.titleHi = titleHi;
    if (excerptHi !== undefined) article.excerptHi = excerptHi;
    if (contentHi !== undefined) article.contentHi = contentHi;

    let oldCoverImage = null;
    if (coverImage !== undefined && coverImage !== article.coverImage) {
      oldCoverImage = article.coverImage;
      article.coverImage = coverImage;
    }

    if (isActive !== undefined)
      article.isActive = isActive === true || isActive === "true";

    await article.save();

    if (oldCoverImage) {
      await deleteCloudinaryAssetsByUrl([oldCoverImage]);
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

    await deleteCloudinaryAssetsByUrl([article.coverImage]);

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

// ============================
// ONE-OFF MIGRATION — bulk-fill Hindi translations for existing
// articles, and create the one brand-new article, in a single call
// instead of an admin re-typing 20 articles' worth of content by hand
// through the UI. Secret-protected the same way the cron-triggered
// endpoints are (see cartController's sendAbandonedCartReminders) since
// this has no session/browser to carry an admin JWT. Meant to be
// removed once it's actually been run — see the follow-up commit.
// ============================
export const hindiBulkSync = async (req, res) => {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { updates = [], creates = [] } = req.body;

    let updated = 0;
    const notFound = [];

    for (const u of updates) {
      const result = await Article.updateOne(
        { slug: u.slug },
        {
          $set: {
            titleHi: u.titleHi || "",
            excerptHi: u.excerptHi || "",
            contentHi: u.contentHi || "",
          },
        },
      );
      if (result.matchedCount === 0) {
        notFound.push(u.slug);
      } else {
        updated += 1;
      }
    }

    let created = 0;
    const skippedExisting = [];

    for (const c of creates) {
      const slug = generateSlug(c.title);
      const existing = await Article.findOne({ slug });

      if (existing) {
        skippedExisting.push(slug);
        continue;
      }

      await Article.create({
        title: c.title,
        slug,
        excerpt: c.excerpt || "",
        content: c.content,
        titleHi: c.titleHi || "",
        excerptHi: c.excerptHi || "",
        contentHi: c.contentHi || "",
        coverImage: c.coverImage || "",
        isActive: true,
      });
      created += 1;
    }

    res.status(200).json({
      success: true,
      updated,
      notFound,
      created,
      skippedExisting,
    });
  } catch (error) {
    console.error("Hindi Bulk Sync Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
