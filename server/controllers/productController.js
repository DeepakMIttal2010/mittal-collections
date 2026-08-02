import Product from "../models/Product.js";
import Order from "../models/Order.js";

// ============================
// GET ALL PRODUCTS
// ============================
export const getProducts = async (req, res) => {
  try {
    const filter = { isActive: true };

    const { search, category, subcategory, maxPrice } = req.query;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: regex }, { description: regex }];
    }
    if (category && category.trim()) {
      filter.category = category.trim();
    }
    if (subcategory && subcategory.trim()) {
      filter.subcategory = subcategory.trim();
    }
    if (maxPrice && !Number.isNaN(Number(maxPrice))) {
      filter.price = { $lte: Number(maxPrice) };
    }

    const products = await Product.find(filter)
      .populate("category", "name slug image")
      .populate("subcategory", "name slug")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL PRODUCTS (Admin — includes inactive, paginated)
// ============================
export const getAllProductsAdmin = async (req, res) => {
  try {
    const filter = {};

    const { search } = req.query;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: regex }, { description: regex }];
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const allowedSortFields = ["name", "price", "stock", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate("category", "name slug image")
      .populate("subcategory", "name slug")
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      products,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET TRENDING PRODUCTS (Public)
// ============================
export const getTrendingProducts = async (req, res) => {
  try {
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

    const products = await Product.find({ isActive: true, isTrending: true })
      .populate("category", "name slug image")
      .populate("subcategory", "name slug")
      .sort({ trendingRank: 1, updatedAt: -1 })
      .limit(limit);

    const lastUpdated = products.length
      ? products.reduce(
          (latest, product) =>
            product.updatedAt > latest ? product.updatedAt : latest,
          products[0].updatedAt,
        )
      : null;

    res.status(200).json({
      success: true,
      products,
      lastUpdated,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET SINGLE PRODUCT
// ============================
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category", "name slug image")
      .populate("subcategory", "name slug");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD PRODUCT
// ============================
export const addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      oldPrice,
      category,
      subcategory,
      stock,
      featured,
      isActive,
      isTrending,
      trendingRank,
      mainImageIndex,
    } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product image is required",
      });
    }

    const images = req.files.map((file) => file.path);

    const mainIndex = Math.min(
      Math.max(parseInt(mainImageIndex, 10) || 0, 0),
      images.length - 1,
    );

    const product = await Product.create({
      name,
      description,
      price,
      oldPrice,
      category,
      subcategory: subcategory || null,
      stock,
      featured: featured === "true",
      isActive: isActive === "true",
      isTrending: isTrending === "true",
      trendingRank: trendingRank || 0,

      image: images[mainIndex],
      images,
    });

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      product,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to add product",
    });
  }
};

// ============================
// UPDATE PRODUCT
// ============================
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.name = req.body.name;
    product.description = req.body.description;
    product.price = req.body.price;
    product.oldPrice = req.body.oldPrice;
    product.category = req.body.category;
    product.subcategory = req.body.subcategory || null;
    product.stock = req.body.stock;

    product.featured = req.body.featured === "true";
    product.isActive = req.body.isActive === "true";
    product.isTrending = req.body.isTrending === "true";
    product.trendingRank = req.body.trendingRank || 0;

    let existingImages = product.images.length
      ? product.images
      : [product.image].filter(Boolean);

    if (req.body.existingImages !== undefined) {
      try {
        existingImages = JSON.parse(req.body.existingImages);
      } catch {
        existingImages = [];
      }
    }

    const newImages = (req.files || []).map((file) => file.path);

    const finalImages = [...existingImages, ...newImages];

    if (finalImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product image is required",
      });
    }

    const mainIndex = Math.min(
      Math.max(parseInt(req.body.mainImageIndex, 10) || 0, 0),
      finalImages.length - 1,
    );

    product.images = finalImages;
    product.image = finalImages[mainIndex];

    await product.save();

    res.json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to update product",
    });
  }
};

// ============================
// RESTORE PRODUCT
// ============================
export const restoreProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.isActive = true;
    await product.save();

    res.json({
      success: true,
      message: "Product restored successfully",
      product,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to restore product",
    });
  }
};

// ============================
// DELETE PRODUCT
// ============================
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.isActive = false;
    await product.save();

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to delete product",
    });
  }
};

// ============================
// PERMANENTLY DELETE PRODUCT (Admin)
// ============================
export const permanentlyDeleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.isActive) {
      return res.status(400).json({
        success: false,
        message: "Delete this product first before removing it permanently",
      });
    }

    const hasOrders = await Order.exists({
      "orderItems.product": product._id,
    });

    if (hasOrders) {
      return res.status(400).json({
        success: false,
        message:
          "This product has existing orders and cannot be permanently deleted",
      });
    }

    await product.deleteOne();

    res.json({
      success: true,
      message: "Product permanently deleted",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to permanently delete product",
    });
  }
};
