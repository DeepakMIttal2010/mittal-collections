import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import subcategoryRoutes from "./routes/subcategoryRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import stateRoutes from "./routes/stateRoutes.js";
import testimonialRoutes from "./routes/testimonialRoutes.js";
import pageRoutes from "./routes/pageRoutes.js";
import siteSettingsRoutes from "./routes/siteSettingsRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import footerLinkRoutes from "./routes/footerLinkRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import priceRangeRoutes from "./routes/priceRangeRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";

dotenv.config();

connectDB();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Upload Folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/customers", userRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/states", stateRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/pages", pageRoutes);
app.use("/api/settings", siteSettingsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/footer-links", footerLinkRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/price-ranges", priceRangeRoutes);
app.use("/api/analytics", analyticsRoutes);

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Mittal Collections API is running...",
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
