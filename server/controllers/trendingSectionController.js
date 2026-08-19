import TrendingSection from "../models/TrendingSection.js";

// ============================
// GET ALL SECTIONS (Admin)
// ============================
export const getAllTrendingSectionsAdmin = async (req, res) => {
  try {
    const allowedSortFields = ["displayOrder", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "displayOrder";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const sections = await TrendingSection.find()
      .populate("category", "name slug image isActive")
      .sort({ [sortBy]: sortOrder });

    res.status(200).json({
      success: true,
      sections,
    });
  } catch (error) {
    console.error("Get Trending Sections Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD SECTION (Admin)
// ============================
export const addTrendingSection = async (req, res) => {
  try {
    const { category, displayOrder, isActive } = req.body;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    const duplicate = await TrendingSection.findOne({ category });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: duplicate.isActive
          ? "This category already has a Top Trending section"
          : "This category already has a section — restore it instead of adding again",
      });
    }

    const section = await TrendingSection.create({
      category,
      displayOrder: displayOrder || 0,
      isActive: isActive === undefined ? true : isActive,
    });

    await section.populate("category", "name slug image isActive");

    res.status(201).json({
      success: true,
      message: "Section added successfully",
      section,
    });
  } catch (error) {
    console.error("Add Trending Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE SECTION (Admin)
// ============================
export const updateTrendingSection = async (req, res) => {
  try {
    const section = await TrendingSection.findById(req.params.id);

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    const { category, displayOrder, isActive } = req.body;

    if (category !== undefined && category !== String(section.category)) {
      const duplicate = await TrendingSection.findOne({
        _id: { $ne: section._id },
        category,
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "This category already has a Top Trending section",
        });
      }

      section.category = category;
    }

    if (displayOrder !== undefined) section.displayOrder = displayOrder;
    if (isActive !== undefined) section.isActive = isActive;

    await section.save();
    await section.populate("category", "name slug image isActive");

    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      section,
    });
  } catch (error) {
    console.error("Update Trending Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// RESTORE SECTION (Admin)
// ============================
export const restoreTrendingSection = async (req, res) => {
  try {
    const section = await TrendingSection.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true },
    ).populate("category", "name slug image isActive");

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Section restored successfully",
      section,
    });
  } catch (error) {
    console.error("Restore Trending Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE SECTION (Admin)
// ============================
export const deleteTrendingSection = async (req, res) => {
  try {
    const section = await TrendingSection.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (error) {
    console.error("Delete Trending Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// PERMANENTLY DELETE SECTION (Admin)
// ============================
export const permanentlyDeleteTrendingSection = async (req, res) => {
  try {
    const section = await TrendingSection.findById(req.params.id);

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    if (section.isActive) {
      return res.status(400).json({
        success: false,
        message: "Delete this section first before removing it permanently",
      });
    }

    await section.deleteOne();

    res.status(200).json({
      success: true,
      message: "Section permanently deleted",
    });
  } catch (error) {
    console.error("Permanently Delete Trending Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
