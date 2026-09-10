import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import subcategoryRoutes from "./routes/subcategoryRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import posRoutes from "./routes/posRoutes.js";
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
import newArrivalsSectionRoutes from "./routes/newArrivalsSectionRoutes.js";
import trendingSectionRoutes from "./routes/trendingSectionRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import articleRoutes from "./routes/articleRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import rewardsRoutes from "./routes/rewardsRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";
import returnRoutes from "./routes/returnRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import feedRoutes from "./routes/feedRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import staffUserRoutes from "./routes/staffUserRoutes.js";
import { classifyKnownErrors, jsonErrorHandler } from "./middleware/errorHandler.js";

const app = express();

// Render sits behind exactly one reverse proxy — trust X-Forwarded-For
// so req.ip reflects the real visitor IP (needed for geo-location
// lookups). `true` (trust every hop, no matter how many) lets a client
// spoof its own X-Forwarded-For and pick whatever req.ip it wants,
// which trivially defeats every IP-keyed rate limiter below (auth
// brute-force protection included) — express-rate-limit's own startup
// check flags this. `1` trusts exactly the nearest hop (Render's LB)
// and ignores anything further down the chain, i.e. attacker-supplied.
app.set("trust proxy", 1);

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
// DISABLE_AUTH_RATE_LIMIT raises this for the e2e CI job only (see
// .github/workflows/ci.yml) — a single Playwright run's fixtures
// (e2e/tests/helpers.js) alone can exceed 20 auth requests, and unlike
// local dev there's no restart between test files to reset the
// limiter's in-memory store. Never set in production.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});
app.use("/api/auth", authLimiter);

// getCategories now runs a Product.aggregate() (for the live product-count
// nav sort) on top of the plain find() it used to do — a heavier query on
// a public, unauthenticated, every-page-load route, which CodeQL flagged
// as unrated-limited. Generous limit (this is normal browsing traffic,
// not a sensitive endpoint like auth) — just enough to blunt a scripted
// flood rather than genuinely constrain anyone browsing the site.
const categoryReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/categories", categoryReadLimiter);

// General catch-all for every other route — CodeQL flags any handler
// that performs auth/a DB query with no rate limiter at all on its
// path, and most of this app's ~150 routes had never had one (the two
// limiters above were added only when a specific route got flagged).
// Adding the admin RBAC feature touched so many route files in one PR
// that CodeQL's alert-fingerprinting re-surfaced this as ~200 "new"
// findings across files this PR didn't even touch — the actual gap was
// already app-wide. A single generous, generic limiter here closes all
// of them at once instead of hand-adding a bespoke one per route file;
// the two specific limiters above still take precedence for their own
// paths since Express runs whichever middleware matches first and
// rate-limit counters are independent per instance regardless.
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.DISABLE_AUTH_RATE_LIMIT === "true" ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", generalApiLimiter);

// Static Upload Folder — these are legacy uploads only, never overwritten
// in place (new uploads go to Cloudinary), so a long cache is safe.
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "30d",
    immutable: true,
  }),
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/customers", userRoutes);
app.use("/api/admin/pos", posRoutes);
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
app.use("/api/new-arrivals-sections", newArrivalsSectionRoutes);
app.use("/api/trending-sections", trendingSectionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/rewards", rewardsRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/feed", feedRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/admin/staff", staffUserRoutes);

// Error handling — must come after all routes (so it sees their
// errors). classifyKnownErrors runs first so Sentry's own
// status->=500 filtering already skips known-benign cases (a client
// hitting the upload file-count limit, or disconnecting mid-upload);
// jsonErrorHandler runs last so every error, however it started,
// still reaches the client as the `{success, message}` JSON shape the
// frontend's service functions expect instead of Express's default
// HTML error page.
app.use(classifyKnownErrors);

// A no-op if SENTRY_DSN isn't set (see instrument.js), same as the
// rest of the Sentry setup.
Sentry.setupExpressErrorHandler(app);

app.use(jsonErrorHandler);

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Mittal Collections API is running...",
  });
});

export default app;
