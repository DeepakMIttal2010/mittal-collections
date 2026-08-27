import Page from "../models/Page.js";

// ============================
// GET PAGE BY SLUG (Public)
// ============================
export const getPageBySlug = async (req, res) => {
  try {
    const page = await Page.findOne({
      slug: req.params.slug,
      isActive: true,
    });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    res.status(200).json({
      success: true,
      page,
    });
  } catch (error) {
    console.error("Get Page Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL PAGES (Admin)
// ============================
export const getAllPagesAdmin = async (req, res) => {
  try {
    const allowedSortFields = ["title", "createdAt", "updatedAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "title";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const pages = await Page.find().sort({ [sortBy]: sortOrder });

    res.status(200).json({
      success: true,
      pages,
    });
  } catch (error) {
    console.error("Get Pages Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// CREATE PAGE (Admin)
// ============================
export const createPage = async (req, res) => {
  try {
    const { title, content, titleHi, contentHi } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Title must contain at least one letter or number",
      });
    }

    const existingPage = await Page.findOne({ slug });

    if (existingPage) {
      if (existingPage.isActive) {
        return res.status(400).json({
          success: false,
          message: "A page with this title already exists",
        });
      }

      existingPage.title = title;
      existingPage.content = content;
      existingPage.titleHi = titleHi || "";
      existingPage.contentHi = contentHi || "";
      existingPage.isActive = true;

      await existingPage.save();

      return res.status(201).json({
        success: true,
        message: "Page created successfully",
        page: existingPage,
      });
    }

    const page = await Page.create({
      slug,
      title,
      content,
      titleHi: titleHi || "",
      contentHi: contentHi || "",
    });

    res.status(201).json({
      success: true,
      message: "Page created successfully",
      page,
    });
  } catch (error) {
    console.error("Create Page Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE PAGE (Admin)
// ============================
export const updatePage = async (req, res) => {
  try {
    const page = await Page.findOne({ slug: req.params.slug });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    const { title, content, titleHi, contentHi } = req.body;

    if (title) page.title = title;
    if (content) page.content = content;
    if (titleHi !== undefined) page.titleHi = titleHi;
    if (contentHi !== undefined) page.contentHi = contentHi;

    await page.save();

    res.status(200).json({
      success: true,
      message: "Page updated successfully",
      page,
    });
  } catch (error) {
    console.error("Update Page Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// RESTORE PAGE (Admin)
// ============================
export const restorePage = async (req, res) => {
  try {
    const page = await Page.findOneAndUpdate(
      { slug: req.params.slug },
      { isActive: true },
      { new: true },
    );

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Page restored successfully",
      page,
    });
  } catch (error) {
    console.error("Restore Page Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE PAGE (Admin)
// ============================
export const deletePage = async (req, res) => {
  try {
    const page = await Page.findOneAndUpdate(
      { slug: req.params.slug },
      { isActive: false },
      { new: true },
    );

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Page deleted successfully",
    });
  } catch (error) {
    console.error("Delete Page Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// PERMANENTLY DELETE PAGE (Admin)
// ============================
export const permanentlyDeletePage = async (req, res) => {
  try {
    const page = await Page.findOne({ slug: req.params.slug });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      });
    }

    if (page.isActive) {
      return res.status(400).json({
        success: false,
        message: "Delete this page first before removing it permanently",
      });
    }

    await page.deleteOne();

    res.status(200).json({
      success: true,
      message: "Page permanently deleted",
    });
  } catch (error) {
    console.error("Permanently Delete Page Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
