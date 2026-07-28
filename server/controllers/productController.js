import Product from "../models/Product.js";

// ============================
// GET ALL PRODUCTS
// ============================
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .populate("category", "name slug image")
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
// GET SINGLE PRODUCT
// ============================
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "category",
      "name slug image",
    );

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
      stock,
      featured,
      isActive,
    } = req.body;

    const product = await Product.create({
      name,
      description,
      price,
      oldPrice,
      category,
      stock,
      featured: featured === "true",
      isActive: isActive === "true",

      image: req.file ? `/uploads/products/${req.file.filename}` : "",
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
    product.stock = req.body.stock;

    product.featured = req.body.featured === "true";
    product.isActive = req.body.isActive === "true";

    if (req.file) {
      product.image = `/uploads/products/${req.file.filename}`;
    }

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

    await product.deleteOne();

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
