import Category from "../models/Category.js";
import Product from "../models/Product.js";
import Subcategory from "../models/Subcategory.js";
import { deleteCloudinaryAssetsByUrl } from "../utils/cloudinaryCleanup.js";

// Simple slug generator from category name
const generateSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ============================
// Get All Categories (Public)
// ============================
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).lean();

    // Same "browsable" definition getProducts uses for its own listing —
    // a category's nav weight comes from how many products a customer
    // could actually find there, not raw document count.
    const counts = await Product.aggregate([
      {
        $match: {
          isActive: true,
          visibility: { $ne: "offline" },
          $or: [{ stock: { $gt: 0 } }, { willRestock: { $ne: false } }],
        },
      },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const countByCategoryId = new Map(
      counts.map((c) => [c._id.toString(), c.count]),
    );

    // Pinned categories keep manual control (displayOrder, ascending) and
    // sort ahead of every unpinned one; unpinned categories default to
    // product count, richest first, so the nav reflects actual catalog
    // depth instead of whatever order they happened to be created in.
    const withCounts = categories.map((c) => ({
      ...c,
      // .lean() skips schema defaults, so a category saved before this
      // field existed comes back with isPinned undefined rather than
      // false — normalize it here so the API always returns a real
      // boolean and undefined can't slip through the sort below.
      isPinned: c.isPinned ?? false,
      productCount: countByCategoryId.get(c._id.toString()) || 0,
    }));
    withCounts.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isPinned) return a.displayOrder - b.displayOrder;
      return b.productCount - a.productCount;
    });

    res.status(200).json({
      success: true,
      categories: withCounts,
    });
  } catch (error) {
    console.error("Get Categories Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get All Categories (Admin — paginated, with search)
// ============================
export const getAllCategoriesAdmin = async (req, res) => {
  try {
    const filter = {};

    const { search } = req.query;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: regex }, { description: regex }];
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const allowedSortFields = ["name", "displayOrder", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "displayOrder";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const total = await Category.countDocuments(filter);

    const categories = await Category.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      categories,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error("Get Categories Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Single Category (Public)
// ============================
export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("Get Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Add Category (Admin)
// ============================
export const addCategory = async (req, res) => {
  try {
    const {
      name,
      nameHi,
      description,
      featured,
      displayOrder,
      isActive,
      isPinned,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Category image is required",
      });
    }

    const slug = generateSlug(name);

    const existing = await Category.findOne({ slug });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A category with this name already exists",
      });
    }

    const category = await Category.create({
      name,
      nameHi: nameHi || "",
      slug,
      description: description || "",
      image: req.file.path,
      featured: featured === "true" || featured === true,
      displayOrder: displayOrder || 0,
      isActive: isActive === "true" || isActive === true,
      isPinned: isPinned === "true" || isPinned === true,
    });

    res.status(201).json({
      success: true,
      message: "Category added successfully",
      category,
    });
  } catch (error) {
    console.error("Add Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Update Category (Admin)
// ============================
export const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const {
      name,
      nameHi,
      description,
      featured,
      displayOrder,
      isActive,
      isPinned,
    } = req.body;

    if (name && name !== category.name) {
      category.name = name;
      category.slug = generateSlug(name);
    }

    if (nameHi !== undefined) category.nameHi = nameHi;
    if (description !== undefined) category.description = description;
    if (featured !== undefined)
      category.featured = featured === "true" || featured === true;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined)
      category.isActive = isActive === "true" || isActive === true;
    if (isPinned !== undefined)
      category.isPinned = isPinned === "true" || isPinned === true;

    let oldImage = null;
    if (req.file) {
      oldImage = category.image;
      category.image = req.file.path;
    }

    await category.save();

    if (oldImage) {
      await deleteCloudinaryAssetsByUrl([oldImage]);
    }

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    console.error("Update Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Restore Category (Admin)
// ============================
export const restoreCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    category.isActive = true;
    await category.save();

    res.status(200).json({
      success: true,
      message: "Category restored successfully",
      category,
    });
  } catch (error) {
    console.error("Restore Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Delete Category (Admin)
// ============================
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    category.isActive = false;
    await category.save();

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Delete Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Permanently Delete Category (Admin)
// ============================
export const permanentlyDeleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (category.isActive) {
      return res.status(400).json({
        success: false,
        message: "Delete this category first before removing it permanently",
      });
    }

    const [hasProducts, hasSubcategories] = await Promise.all([
      Product.exists({ category: category._id }),
      Subcategory.exists({ category: category._id }),
    ]);

    if (hasProducts || hasSubcategories) {
      return res.status(400).json({
        success: false,
        message:
          "This category is still used by products or subcategories and cannot be permanently deleted",
      });
    }

    await category.deleteOne();

    await deleteCloudinaryAssetsByUrl([category.image, category.banner]);

    res.status(200).json({
      success: true,
      message: "Category permanently deleted",
    });
  } catch (error) {
    console.error("Permanently Delete Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
