import Product from "../models/Product.js";
import Order from "../models/Order.js";
import StockAlert from "../models/StockAlert.js";
import SearchLog from "../models/SearchLog.js";
import User from "../models/User.js";
import { rankProducts } from "../utils/fuzzySearch.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "../utils/notify.js";
import {
  generateProductNumber,
  decodeProductNumber,
} from "../utils/costCipher.js";

// Never sent by a public route — cost data is admin-only.
const COST_FIELDS = "-purchasePrice -purchaseDate";

const generateSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const slugify = (text) =>
  (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Emails every unnotified StockAlert subscriber for a product, then
// marks them notified. Fire-and-forget — never blocks the caller.
export const notifyStockAlertSubscribers = async (product) => {
  const alerts = await StockAlert.find({ product: product._id, notified: false });

  if (alerts.length === 0) return;

  const slug = product.slug || slugify(product.name);
  const productLink = `${process.env.CLIENT_URL}/product/${product._id}/${slug}`;

  for (const alert of alerts) {
    try {
      await sendEmail({
        to: alert.email,
        subject: `${product.name} is back in stock!`,
        html: `
          <p>Good news — <strong>${product.name}</strong> is back in stock at Mittal Collections.</p>
          <p><a href="${productLink}">Shop it now</a> before it sells out again.</p>
        `,
      });

      alert.notified = true;
      await alert.save();
    } catch (error) {
      console.error(`Stock alert email failed for ${alert.email}:`, error);
    }

    // In-app notification is independent of email delivery — matches
    // every other notification type in the app (order status, ticket
    // reply, return status all fire notifyUser() regardless of whether
    // the accompanying email succeeds), so a bounced email doesn't
    // silently also cost the customer the bell notification.
    const subscriber = await User.findOne({ email: alert.email }).select("_id");
    if (subscriber) {
      notifyUser({
        userId: subscriber._id,
        type: "back_in_stock",
        title: `${product.name} is back in stock!`,
        link: `/product/${product._id}/${slug}`,
      });
    }
  }
};

// ============================
// SUBSCRIBE TO BACK-IN-STOCK ALERT (Public)
// ============================
export const subscribeStockAlert = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await StockAlert.findOneAndUpdate(
      { product: product._id, email: email.toLowerCase().trim() },
      { notified: false },
      { upsert: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({
      success: true,
      message: "We'll email you when this is back in stock",
    });
  } catch (error) {
    console.error("Subscribe Stock Alert Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL PRODUCTS
// ============================
export const getProducts = async (req, res) => {
  try {
    const filter = { isActive: true, visibility: { $ne: "offline" } };

    const { search, category, subcategory, maxPrice, minPrice, sortBy } =
      req.query;

    if (category && category.trim()) {
      filter.category = category.trim();
    }
    if (subcategory && subcategory.trim()) {
      filter.subcategory = subcategory.trim();
    }
    if (maxPrice && !Number.isNaN(Number(maxPrice))) {
      filter.price = { ...filter.price, $lte: Number(maxPrice) };
    }
    if (minPrice && !Number.isNaN(Number(minPrice))) {
      filter.price = { ...filter.price, $gte: Number(minPrice) };
    }

    let products = await Product.find(filter)
      .select(COST_FIELDS)
      .populate("category", "name slug image")
      .populate("subcategory", "name slug")
      .sort({ createdAt: -1 });

    const hasSearch = search && search.trim();
    if (hasSearch) {
      products = rankProducts(search.trim(), products);

      // Fire-and-forget — never let logging slow down or break a search.
      SearchLog.create({
        query: search.trim(),
        resultCount: products.length,
      }).catch((error) => console.error("Search Log Error:", error));
    }

    if (sortBy === "price_asc") {
      products = [...products].sort((a, b) => a.price - b.price);
    } else if (sortBy === "price_desc") {
      products = [...products].sort((a, b) => b.price - a.price);
    } else if (sortBy === "newest" || (!hasSearch && !sortBy)) {
      products = [...products].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
    }

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
// GET SEARCH SUGGESTIONS (autocomplete)
// ============================
export const getSearchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(200).json({ success: true, products: [] });
    }

    const products = await Product.find({
      isActive: true,
      visibility: { $ne: "offline" },
    }).select("name slug price image");

    const ranked = rankProducts(q.trim(), products).slice(0, 6);

    res.status(200).json({
      success: true,
      products: ranked,
    });
  } catch (error) {
    console.error("Get Search Suggestions Error:", error);

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

    const { search, category, subcategory, stockStatus, dateFrom, dateTo } =
      req.query;

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

    if (stockStatus === "inStock") {
      filter.stock = { $gt: 0 };
    } else if (stockStatus === "outOfStock") {
      filter.stock = { $lte: 0 };
    }

    if (dateFrom || dateTo) {
      filter.purchaseDate = {};
      if (dateFrom) filter.purchaseDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.purchaseDate.$lte = end;
      }
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const allowedSortFields = [
      "name",
      "price",
      "stock",
      "createdAt",
      "featured",
      "isReturnable",
      "isTrending",
      "restockAlertEnabled",
      "categoryName",
    ];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const total = await Product.countDocuments(filter);

    let products;

    if (sortBy === "categoryName") {
      // category is a reference, so sorting by its name needs an actual
      // join — a plain .sort() would just order by the raw ObjectId.
      const raw = await Product.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "categoryDoc",
          },
        },
        { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
        { $sort: { "categoryDoc.name": sortOrder } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);

      products = await Product.populate(raw, [
        { path: "category", select: "name slug image" },
        { path: "subcategory", select: "name slug" },
      ]);
    } else {
      products = await Product.find(filter)
        .populate("category", "name slug image")
        .populate("subcategory", "name slug")
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit);
    }

    const productsWithNumber = products.map((product) => {
      const obj =
        typeof product.toObject === "function" ? product.toObject() : product;

      return {
        ...obj,
        productNumber: generateProductNumber({
          purchaseDate: obj.purchaseDate,
          purchasePrice: obj.purchasePrice,
          productId: obj._id,
        }),
      };
    });

    res.status(200).json({
      success: true,
      products: productsWithNumber,
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
// GET SINGLE PRODUCT (Admin — full doc incl. cost fields, for Edit page)
// ============================
export const getProductByIdAdmin = async (req, res) => {
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
      product: {
        ...product.toObject(),
        productNumber: generateProductNumber({
          purchaseDate: product.purchaseDate,
          purchasePrice: product.purchasePrice,
          productId: product._id,
        }),
      },
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
// DUPLICATE PRODUCT (Admin) — copies everything except images, so the
// admin can reuse a product as a starting point and just upload fresh
// photos on the Edit page afterwards. Inactive until they do.
// ============================
export const duplicateProduct = async (req, res) => {
  try {
    const source = await Product.findById(req.params.id);

    if (!source) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const name = `${source.name} (Copy)`;

    const duplicate = await Product.create({
      name,
      slug: generateSlug(`${name}-${Date.now()}`),
      description: source.description,
      price: source.price,
      oldPrice: source.oldPrice,
      category: source.category,
      subcategory: source.subcategory,
      stock: source.stock,

      fabric: source.fabric,
      size: source.size,
      gsm: source.gsm,
      washCare: source.washCare,
      brand: source.brand,
      countryOfOrigin: source.countryOfOrigin,

      featured: false,
      isTrending: false,
      trendingRank: 0,
      isActive: false,

      isReturnable: source.isReturnable,
      returnPeriodDays: source.returnPeriodDays,

      restockAlertEnabled: source.restockAlertEnabled,
      restockAlertQuantity: source.restockAlertQuantity,

      purchasePrice: source.purchasePrice,
      purchaseDate: source.purchaseDate,

      image: "",
      images: [],
      videos: [],
    });

    res.status(201).json({
      success: true,
      message: "Product duplicated — add images and activate it on the Edit page",
      product: duplicate,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to duplicate product",
    });
  }
};

// ============================
// DECODE A LABEL'S PRODUCT NUMBER (Admin) — reverse lookup for a staff
// member reading a printed label back into month/year + cost.
// ============================
export const decodeProductNumberController = async (req, res) => {
  try {
    const decoded = decodeProductNumber(req.query.number);

    if (!decoded) {
      return res.status(400).json({
        success: false,
        message: "Not a recognisable product number",
      });
    }

    res.json({ success: true, decoded });
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

    const products = await Product.find({
      isActive: true,
      isTrending: true,
      visibility: { $ne: "offline" },
    })
      .select(COST_FIELDS)
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
// GET BEST SELLERS (Public) — ranked by actual units sold, not a
// manually curated list like "trending".
// ============================
export const getBestSellers = async (req, res) => {
  try {
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

    const salesByProduct = await Order.aggregate([
      { $match: { orderStatus: { $ne: "Cancelled" } } },
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: "$orderItems.product",
          totalSold: { $sum: "$orderItems.quantity" },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: limit * 2 }, // headroom for any inactive products filtered out below
    ]);

    const productIds = salesByProduct.map((entry) => entry._id);

    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true,
      visibility: { $ne: "offline" },
    })
      .select(COST_FIELDS)
      .populate("category", "name slug image")
      .populate("subcategory", "name slug");

    const soldCountById = new Map(
      salesByProduct.map((entry) => [entry._id.toString(), entry.totalSold]),
    );

    const bestSellers = products
      .sort(
        (a, b) =>
          (soldCountById.get(b._id.toString()) || 0) -
          (soldCountById.get(a._id.toString()) || 0),
      )
      .slice(0, limit);

    res.status(200).json({
      success: true,
      products: bestSellers,
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
      .select(COST_FIELDS)
      .populate("category", "name slug image")
      .populate("subcategory", "name slug");

    if (!product || product.visibility === "offline") {
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
      nameHi,
      descriptionHi,
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
      fabric,
      size,
      gsm,
      washCare,
      brand,
      countryOfOrigin,
      isReturnable,
      returnPeriodDays,
      restockAlertEnabled,
      restockAlertQuantity,
      purchasePrice,
      purchaseDate,
      visibility,
    } = req.body;

    const images = (req.files?.images || []).map((file) => file.path);
    const videos = (req.files?.videos || []).map((file) => file.path);

    if (images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product image is required",
      });
    }

    const mainIndex = Math.min(
      Math.max(parseInt(mainImageIndex, 10) || 0, 0),
      images.length - 1,
    );

    const product = await Product.create({
      name,
      slug: generateSlug(name),
      description,
      nameHi: nameHi || "",
      descriptionHi: descriptionHi || "",
      price,
      oldPrice,
      category,
      subcategory: subcategory || null,
      stock,
      featured: featured === "true",
      isActive: isActive === "true",
      isTrending: isTrending === "true",
      trendingRank: trendingRank || 0,
      visibility: ["both", "online", "offline"].includes(visibility)
        ? visibility
        : "both",

      fabric: fabric || "",
      size: size || "",
      gsm: gsm || "",
      washCare: washCare || "",
      brand: brand || "",
      countryOfOrigin: countryOfOrigin || "",

      isReturnable: isReturnable === undefined ? true : isReturnable === "true",
      returnPeriodDays: returnPeriodDays || 0,

      restockAlertEnabled: restockAlertEnabled === "true",
      restockAlertQuantity: restockAlertQuantity || 0,

      purchasePrice: purchasePrice || 0,
      purchaseDate: purchaseDate || Date.now(),

      image: images[mainIndex],
      images,
      videos,
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

    const wasOutOfStock = product.stock <= 0;

    product.name = req.body.name;
    product.slug = generateSlug(req.body.name);
    product.description = req.body.description;
    product.nameHi = req.body.nameHi || "";
    product.descriptionHi = req.body.descriptionHi || "";
    product.price = req.body.price;
    product.oldPrice = req.body.oldPrice;
    product.category = req.body.category;
    product.subcategory = req.body.subcategory || null;
    product.stock = req.body.stock;

    product.featured = req.body.featured === "true";
    product.isActive = req.body.isActive === "true";
    product.isTrending = req.body.isTrending === "true";
    product.trendingRank = req.body.trendingRank || 0;
    product.visibility = ["both", "online", "offline"].includes(
      req.body.visibility,
    )
      ? req.body.visibility
      : "both";

    product.fabric = req.body.fabric || "";
    product.size = req.body.size || "";
    product.gsm = req.body.gsm || "";
    product.washCare = req.body.washCare || "";
    product.brand = req.body.brand || "";
    product.countryOfOrigin = req.body.countryOfOrigin || "";

    product.isReturnable =
      req.body.isReturnable === undefined
        ? true
        : req.body.isReturnable === "true";
    product.returnPeriodDays = req.body.returnPeriodDays || 0;

    product.restockAlertEnabled = req.body.restockAlertEnabled === "true";
    product.restockAlertQuantity = req.body.restockAlertQuantity || 0;

    product.purchasePrice = req.body.purchasePrice || 0;
    if (req.body.purchaseDate) product.purchaseDate = req.body.purchaseDate;

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

    const newImages = (req.files?.images || []).map((file) => file.path);

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

    let existingVideos = product.videos || [];

    if (req.body.existingVideos !== undefined) {
      try {
        existingVideos = JSON.parse(req.body.existingVideos);
      } catch {
        existingVideos = [];
      }
    }

    const newVideos = (req.files?.videos || []).map((file) => file.path);

    product.videos = [...existingVideos, ...newVideos];

    await product.save();

    if (wasOutOfStock && product.stock > 0) {
      notifyStockAlertSubscribers(product).catch((error) =>
        console.error("Notify Stock Alert Subscribers Error:", error),
      );
    }

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
