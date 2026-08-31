import NewArrivalsSection from "../models/NewArrivalsSection.js";

// ============================
// GET ALL SECTIONS (Admin)
// ============================
export const getAllNewArrivalsSectionsAdmin = async (req, res) => {
  try {
    const allowedSortFields = ["displayOrder", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "displayOrder";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const sections = await NewArrivalsSection.find()
      .populate("category", "name nameHi slug image isActive")
      .sort({ [sortBy]: sortOrder });

    res.status(200).json({
      success: true,
      sections,
    });
  } catch (error) {
    console.error("Get New Arrivals Sections Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD SECTION (Admin)
// ============================
export const addNewArrivalsSection = async (req, res) => {
  try {
    const { category, displayOrder, isActive } = req.body;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    const duplicate = await NewArrivalsSection.findOne({ category });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: duplicate.isActive
          ? "This category already has a New Arrivals section"
          : "This category already has a section — restore it instead of adding again",
      });
    }

    const section = await NewArrivalsSection.create({
      category,
      displayOrder: displayOrder || 0,
      isActive: isActive === undefined ? true : isActive,
    });

    await section.populate("category", "name nameHi slug image isActive");

    res.status(201).json({
      success: true,
      message: "Section added successfully",
      section,
    });
  } catch (error) {
    console.error("Add New Arrivals Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE SECTION (Admin)
// ============================
export const updateNewArrivalsSection = async (req, res) => {
  try {
    const section = await NewArrivalsSection.findById(req.params.id);

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    const { category, displayOrder, isActive } = req.body;

    if (category !== undefined && category !== String(section.category)) {
      const duplicate = await NewArrivalsSection.findOne({
        _id: { $ne: section._id },
        category,
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "This category already has a New Arrivals section",
        });
      }

      section.category = category;
    }

    if (displayOrder !== undefined) section.displayOrder = displayOrder;
    if (isActive !== undefined) section.isActive = isActive;

    await section.save();
    await section.populate("category", "name nameHi slug image isActive");

    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      section,
    });
  } catch (error) {
    console.error("Update New Arrivals Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// RESTORE SECTION (Admin)
// ============================
export const restoreNewArrivalsSection = async (req, res) => {
  try {
    const section = await NewArrivalsSection.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true },
    ).populate("category", "name nameHi slug image isActive");

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
    console.error("Restore New Arrivals Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE SECTION (Admin)
// ============================
export const deleteNewArrivalsSection = async (req, res) => {
  try {
    const section = await NewArrivalsSection.findByIdAndUpdate(
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
    console.error("Delete New Arrivals Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// PERMANENTLY DELETE SECTION (Admin)
// ============================
export const permanentlyDeleteNewArrivalsSection = async (req, res) => {
  try {
    const section = await NewArrivalsSection.findById(req.params.id);

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
    console.error("Permanently Delete New Arrivals Section Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
