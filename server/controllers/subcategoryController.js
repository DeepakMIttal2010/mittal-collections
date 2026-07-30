import Subcategory from "../models/Subcategory.js";

const generateSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ============================
// Get All Subcategories, grouped-ready (Public)
// Used by the mega menu
// ============================
export const getSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find({ isActive: true })
      .populate("category", "name slug")
      .sort({ displayOrder: 1 });

    res.status(200).json({
      success: true,
      subcategories,
    });
  } catch (error) {
    console.error("Get Subcategories Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get All Subcategories (Admin - includes inactive)
// ============================
export const getAllSubcategoriesAdmin = async (req, res) => {
  try {
    const filter = {};

    const { search } = req.query;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: regex }, { groupLabel: regex }];
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const total = await Subcategory.countDocuments(filter);

    const subcategories = await Subcategory.find(filter)
      .populate("category", "name slug")
      .sort({ displayOrder: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      subcategories,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error("Get Subcategories Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Add Subcategory (Admin)
// ============================
export const addSubcategory = async (req, res) => {
  try {
    const { category, groupLabel, name, displayOrder, isActive } = req.body;

    if (!category || !groupLabel || !name) {
      return res.status(400).json({
        success: false,
        message: "Category, group label and name are required",
      });
    }

    const slug = generateSlug(name);

    const subcategory = await Subcategory.create({
      category,
      groupLabel,
      name,
      slug,
      displayOrder: displayOrder || 0,
      isActive: isActive === undefined ? true : isActive,
    });

    res.status(201).json({
      success: true,
      message: "Subcategory added successfully",
      subcategory,
    });
  } catch (error) {
    console.error("Add Subcategory Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Update Subcategory (Admin)
// ============================
export const updateSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    const { category, groupLabel, name, displayOrder, isActive } = req.body;

    if (category) subcategory.category = category;
    if (groupLabel) subcategory.groupLabel = groupLabel;

    if (name) {
      subcategory.name = name;
      subcategory.slug = generateSlug(name);
    }

    if (displayOrder !== undefined) subcategory.displayOrder = displayOrder;
    if (isActive !== undefined) subcategory.isActive = isActive;

    await subcategory.save();

    res.status(200).json({
      success: true,
      message: "Subcategory updated successfully",
      subcategory,
    });
  } catch (error) {
    console.error("Update Subcategory Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Restore Subcategory (Admin)
// ============================
export const restoreSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    subcategory.isActive = true;
    await subcategory.save();

    res.status(200).json({
      success: true,
      message: "Subcategory restored successfully",
      subcategory,
    });
  } catch (error) {
    console.error("Restore Subcategory Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Delete Subcategory (Admin)
// ============================
export const deleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    subcategory.isActive = false;
    await subcategory.save();

    res.status(200).json({
      success: true,
      message: "Subcategory deleted successfully",
    });
  } catch (error) {
    console.error("Delete Subcategory Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
