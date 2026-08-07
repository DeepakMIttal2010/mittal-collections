import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
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
import couponRoutes from "./routes/couponRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import articleRoutes from "./routes/articleRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import rewardsRoutes from "./routes/rewardsRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";

connectDB();

const app = express();

// Render sits behind a reverse proxy — trust X-Forwarded-For so req.ip
// reflects the real visitor IP (needed for geo-location lookups)
app.set("trust proxy", true);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only the real storefront (and local dev) may call this API from a
// browser. Server-to-server calls (cron-job.org, etc.) aren't affected —
// CORS only governs browser-initiated cross-origin requests.
const ALLOWED_ORIGINS = [
  "https://www.mittalcollections.com",
  "https://mittalcollections.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Middlewares
app.use(
  helmet({
    // This is a pure JSON API with no HTML pages of its own, so a CSP
    // header here is inert noise. crossOriginResourcePolicy must allow
    // cross-origin loading since the client (www.mittalcollections.com)
    // fetches images from this server's /uploads folder.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(compression());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limit auth endpoints — 20 attempts per 15 minutes per IP, to
// slow down password brute-forcing without blocking normal use.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});
app.use("/api/auth", authLimiter);

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
app.use("/api/coupons", couponRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/rewards", rewardsRoutes);
app.use("/api/tickets", ticketRoutes);

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
