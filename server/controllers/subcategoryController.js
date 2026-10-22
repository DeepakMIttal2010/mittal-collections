import Subcategory from "../models/Subcategory.js";
import { pickSeoFields } from "../models/seoFields.js";
import Product from "../models/Product.js";
import SiteSettings from "../models/SiteSettings.js";
import { deleteCloudinaryAssetsByUrl } from "../utils/cloudinaryCleanup.js";
import { escapeRegex } from "../utils/escapeRegex.js";

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
    const [subcategories, counts] = await Promise.all([
      Subcategory.find({ isActive: true })
        .populate("category", "name nameHi slug")
        .sort({ displayOrder: 1 })
        .lean(),
      // Same "listable product" filter categoryController uses for each
      // category's productCount, so the two counts are comparable (the
      // storefront uses them to tell a real sub-collection from one that
      // merely repeats its whole category).
      Product.aggregate([
        {
          $match: {
            isActive: true,
            visibility: { $ne: "offline" },
            $or: [{ stock: { $gt: 0 } }, { willRestock: { $ne: false } }],
          },
        },
        { $unwind: "$subcategories" },
        { $group: { _id: "$subcategories", count: { $sum: 1 } } },
      ]),
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.count]));

    res.status(200).json({
      success: true,
      subcategories: subcategories.map((s) => ({ ...s, productCount: countById.get(String(s._id)) || 0 })),
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
    // typeof guard: a bracket-shaped query param (?search[$ne]=null)
    // parses to an object, not a string, and .trim() would throw.
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [{ name: regex }, { groupLabel: regex }];
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const allowedSortFields = ["name", "groupLabel", "displayOrder", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "displayOrder";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    // Same tiebreak reasoning as categoryController.js's admin list —
    // displayOrder defaults to 0 for a subcategory unless an admin typed a
    // distinct value (the add/edit form defaults to 0), and this list is
    // paginated, so a tie with no deterministic order can duplicate/skip a
    // row across pages (2026-10-13 ordering audit).
    const sort = { [sortBy]: sortOrder };
    if (sortBy !== "createdAt") sort.createdAt = 1;

    const total = await Subcategory.countDocuments(filter);

    const subcategories = await Subcategory.find(filter)
      .populate("category", "name nameHi slug")
      .sort(sort)
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
    const {
      category,
      groupLabel,
      name,
      nameHi,
      subtitle,
      subtitleHi,
      displayOrder,
      isActive,
    } = req.body;

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
      nameHi: nameHi || "",
      slug,
      subtitle: subtitle || "",
      subtitleHi: subtitleHi || "",
      ...pickSeoFields(req.body),
      image: req.file ? req.file.path : "",
      displayOrder: displayOrder || 0,
      isActive: isActive === undefined ? true : isActive === "true",
    });

    res.status(201).json({
      success: true,
      message: "Subcategory added successfully",
      subcategory,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A subcategory with this name already exists under this category",
      });
    }

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
  // See categoryController.js's updateCategory for why this is declared
  // outside the try block -- the same orphaned-Cloudinary-upload bug
  // existed here too (deep bug sweep, 2026-10-20).
  let newImage = null;
  try {
    const subcategory = await Subcategory.findById(req.params.id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    const {
      category,
      groupLabel,
      name,
      nameHi,
      subtitle,
      subtitleHi,
      displayOrder,
      isActive,
    } = req.body;

    if (category) subcategory.category = category;
    if (groupLabel) subcategory.groupLabel = groupLabel;

    if (name) {
      subcategory.name = name;
      subcategory.slug = generateSlug(name);
    }

    if (nameHi !== undefined) subcategory.nameHi = nameHi;
    if (subtitle !== undefined) subcategory.subtitle = subtitle;
    if (subtitleHi !== undefined) subcategory.subtitleHi = subtitleHi;
    Object.assign(subcategory, pickSeoFields(req.body));
    if (displayOrder !== undefined) subcategory.displayOrder = displayOrder;
    if (isActive !== undefined) subcategory.isActive = isActive === "true";

    let oldImage = null;
    if (req.file) {
      oldImage = subcategory.image;
      newImage = req.file.path;
      subcategory.image = req.file.path;
    }

    await subcategory.save();

    // Saved successfully -- newImage is now legitimately part of the
    // subcategory, so the catch block below must not delete it if
    // anything after this point throws.
    newImage = null;

    if (oldImage) {
      await deleteCloudinaryAssetsByUrl([oldImage]);
    }

    res.status(200).json({
      success: true,
      message: "Subcategory updated successfully",
      subcategory,
    });
  } catch (error) {
    if (newImage) {
      await deleteCloudinaryAssetsByUrl([newImage]);
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A subcategory with this name already exists under this category",
      });
    }

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

// ============================
// Permanently Delete Subcategory (Admin)
// ============================
export const permanentlyDeleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    if (subcategory.isActive) {
      return res.status(400).json({
        success: false,
        message: "Delete this subcategory first before removing it permanently",
      });
    }

    const hasProducts = await Product.exists({
      subcategories: subcategory._id,
    });

    if (hasProducts) {
      return res.status(400).json({
        success: false,
        message:
          "This subcategory is still used by products and cannot be permanently deleted",
      });
    }

    // Matches permanentlyDeleteCategory's own TrendingSection/
    // NewArrivalsSection check — SiteSettings.pricingRules[].subcategory
    // is another real cross-reference (used for the Add/Edit Product
    // cost auto-fill) that a plain Product.exists check doesn't cover.
    const usedInPricingRules = await SiteSettings.exists({
      "pricingRules.subcategory": subcategory._id,
    });

    if (usedInPricingRules) {
      return res.status(400).json({
        success: false,
        message:
          "This subcategory is used by a pricing rule and cannot be permanently deleted",
      });
    }

    await subcategory.deleteOne();

    await deleteCloudinaryAssetsByUrl([subcategory.image]);

    res.status(200).json({
      success: true,
      message: "Subcategory permanently deleted",
    });
  } catch (error) {
    console.error("Permanently Delete Subcategory Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
