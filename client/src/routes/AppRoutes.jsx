import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Home from "../pages/Home";
import NotFound from "../pages/NotFound";
import MainLayout from "../layouts/MainLayout";
import PageLoader from "../components/PageLoader";

// Every route below this point is code-split, so its JS chunk is only
// fetched from the CDN the first time someone navigates there. If a
// deploy has happened since the tab was opened (or since the browser
// cached the page), that chunk's hashed filename no longer exists and
// the import rejects with "Failed to fetch dynamically imported
// module" — confirmed as a real, escalating Sentry issue (12 events
// over 2 days on /admin/products alone) rather than a one-off. The fix
// is the standard one for Vite SPAs: on a failed chunk load, reload
// the page once (picking up the new build's correct references)
// instead of leaving the user stuck on a route that can never resolve.
// The sessionStorage guard stops a genuinely broken chunk from causing
// an infinite reload loop — it gets one retry, then the real error
// surfaces to the ErrorBoundary.
function lazyWithReload(importer) {
  return lazy(async () => {
    try {
      const mod = await importer();
      sessionStorage.removeItem("chunk-reload-attempted");
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem("chunk-reload-attempted")) {
        sessionStorage.setItem("chunk-reload-attempted", "1");
        window.location.reload();
        // Block the lazy() promise forever — the reload is about to
        // replace this whole page, so there's nothing useful to render.
        return new Promise(() => {});
      }
      throw err;
    }
  });
}

const About = lazyWithReload(() => import("../pages/About"));
const Contact = lazyWithReload(() => import("../pages/Contact"));
const Cart = lazyWithReload(() => import("../pages/Cart"));
const Wishlist = lazyWithReload(() => import("../pages/Wishlist"));
const Login = lazyWithReload(() => import("../pages/Login"));
const Register = lazyWithReload(() => import("../pages/Register"));
const ForgotPassword = lazyWithReload(() => import("../pages/ForgotPassword"));
const ResetPassword = lazyWithReload(() => import("../pages/ResetPassword"));
const ChangePassword = lazyWithReload(() => import("../pages/ChangePassword"));
const Account = lazyWithReload(() => import("../pages/Account"));
const LoyaltyHistory = lazyWithReload(() => import("../pages/LoyaltyHistory"));
const EditProfile = lazyWithReload(() => import("../pages/EditProfile"));
const Addresses = lazyWithReload(() => import("../pages/Addresses"));
const AddressForm = lazyWithReload(() => import("../pages/AddressForm"));
const ProductDetails = lazyWithReload(() => import("../pages/ProductDetails"));
const TrendingPage = lazyWithReload(() => import("../pages/TrendingPage"));
const ClearanceSalePage = lazyWithReload(() => import("../pages/ClearanceSalePage"));
const NewArrivalsPage = lazyWithReload(() => import("../pages/NewArrivalsPage"));
const GiftingPage = lazyWithReload(() => import("../pages/GiftingPage"));
const PriceRangePage = lazyWithReload(() => import("../pages/PriceRangePage"));
const SearchResults = lazyWithReload(() => import("../pages/SearchResults"));
const CategoryPage = lazyWithReload(() => import("../pages/CategoryPage"));
const Checkout = lazyWithReload(() => import("../pages/Checkout"));
const MyOrders = lazyWithReload(() => import("../pages/MyOrders"));
const OrderDetails = lazyWithReload(() => import("../pages/OrderDetails"));
const PolicyPage = lazyWithReload(() => import("../pages/PolicyPage"));
const Articles = lazyWithReload(() => import("../pages/Articles"));
const ArticleDetail = lazyWithReload(() => import("../pages/ArticleDetail"));
const CurtainSizeCalculator = lazyWithReload(
  () => import("../pages/CurtainSizeCalculator"),
);
const Rewards = lazyWithReload(() => import("../pages/Rewards"));
const Compare = lazyWithReload(() => import("../pages/Compare"));
const Tickets = lazyWithReload(() => import("../pages/Tickets"));
const TicketDetail = lazyWithReload(() => import("../pages/TicketDetail"));
const Returns = lazyWithReload(() => import("../pages/Returns"));
const Notifications = lazyWithReload(() => import("../pages/Notifications"));

const AdminProtectedRoute = lazyWithReload(() => import("./AdminProtectedRoute"));
const AdminLogin = lazyWithReload(() => import("../pages/admin/AdminLogin"));
const AdminDashboard = lazyWithReload(() => import("../pages/admin/AdminDashboard"));
const AdminProducts = lazyWithReload(() => import("../pages/admin/AdminProducts"));
const AdminLayout = lazyWithReload(() => import("../layouts/AdminLayout"));

const AddProduct = lazyWithReload(() => import("../pages/admin/AddProduct"));
const EditProduct = lazyWithReload(() => import("../pages/admin/EditProduct"));
const AdminBulkImport = lazyWithReload(() => import("../pages/admin/AdminBulkImport"));

const AdminCategories = lazyWithReload(() => import("../pages/admin/AdminCategories"));
const AddCategory = lazyWithReload(() => import("../pages/admin/AddCategory"));
const EditCategory = lazyWithReload(() => import("../pages/admin/EditCategory"));
const AdminNewArrivalsSections = lazyWithReload(
  () => import("../pages/admin/AdminNewArrivalsSections"),
);
const AdminTrendingByCategory = lazyWithReload(
  () => import("../pages/admin/AdminTrendingByCategory"),
);

const AdminSubcategories = lazyWithReload(
  () => import("../pages/admin/AdminSubcategories"),
);
const AdminTestimonials = lazyWithReload(
  () => import("../pages/admin/AdminTestimonials"),
);
const AdminReviews = lazyWithReload(() => import("../pages/admin/AdminReviews"));
const AdminQuestions = lazyWithReload(() => import("../pages/admin/AdminQuestions"));
const AdminPages = lazyWithReload(() => import("../pages/admin/AdminPages"));
const AdminArticles = lazyWithReload(() => import("../pages/admin/AdminArticles"));
const AdminArticleForm = lazyWithReload(
  () => import("../pages/admin/AdminArticleForm"),
);
const AdminSettings = lazyWithReload(() => import("../pages/admin/AdminSettings"));
const AdminNewsletter = lazyWithReload(() => import("../pages/admin/AdminNewsletter"));
const AdminRewardsSettings = lazyWithReload(
  () => import("../pages/admin/AdminRewardsSettings"),
);
const AdminMessages = lazyWithReload(() => import("../pages/admin/AdminMessages"));
const AdminFooterLinks = lazyWithReload(
  () => import("../pages/admin/AdminFooterLinks"),
);
const AdminBanners = lazyWithReload(() => import("../pages/admin/AdminBanners"));
const AdminPriceRanges = lazyWithReload(
  () => import("../pages/admin/AdminPriceRanges"),
);
const AdminCoupons = lazyWithReload(() => import("../pages/admin/AdminCoupons"));

const AdminOrders = lazyWithReload(() => import("../pages/admin/AdminOrders"));

const AdminProfile = lazyWithReload(() => import("../pages/admin/AdminProfile"));
const AdminChangePassword = lazyWithReload(
  () => import("../pages/admin/AdminChangePassword"),
);

const AdminCustomers = lazyWithReload(() => import("../pages/admin/AdminCustomers"));
const CustomerDetails = lazyWithReload(
  () => import("../pages/admin/CustomerDetails"),
);
const AdminReports = lazyWithReload(() => import("../pages/admin/AdminReports"));
const AdminTickets = lazyWithReload(() => import("../pages/admin/AdminTickets"));
const AdminTicketDetail = lazyWithReload(
  () => import("../pages/admin/AdminTicketDetail"),
);
const AdminReturns = lazyWithReload(() => import("../pages/admin/AdminReturns"));
const AdminPOS = lazyWithReload(() => import("../pages/admin/AdminPOS"));
const AdminWalkthrough = lazyWithReload(() => import("../pages/admin/AdminWalkthrough"));
const PrintLabels = lazyWithReload(() => import("../pages/admin/PrintLabels"));
const ProductQRLabel = lazyWithReload(() => import("../pages/admin/ProductQRLabel"));

const AdminStaffUsers = lazyWithReload(() => import("../pages/admin/AdminStaffUsers"));
const AdminRoles = lazyWithReload(() => import("../pages/admin/AdminRoles"));

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route
            path="/bedsheets"
            element={<Navigate to="/category/bedsheets" replace />}
          />
          <Route
            path="/towels"
            element={<Navigate to="/category/towels" replace />}
          />
          <Route
            path="/curtains"
            element={<Navigate to="/category/curtains" replace />}
          />
          <Route
            path="/pillows"
            element={<Navigate to="/category/pillows" replace />}
          />
          <Route
            path="/blankets"
            element={<Navigate to="/category/blankets" replace />}
          />
          <Route
            path="/offers"
            element={<Navigate to="/trending" replace />}
          />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/account" element={<Account />} />
          <Route path="/loyalty-history" element={<LoyaltyHistory />} />
          <Route path="/edit-profile" element={<EditProfile />} />
          <Route path="/addresses" element={<Addresses />} />
          <Route path="/addresses/add" element={<AddressForm />} />
          <Route path="/addresses/edit/:id" element={<AddressForm />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/my-orders/:id" element={<OrderDetails />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/policies/:slug" element={<PolicyPage />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/articles/:slug" element={<ArticleDetail />} />
          {/* Hindi versions — same components, which self-detect the /hi/
              prefix via useLocation() and render titleHi/excerptHi/
              contentHi (see ArticleDetail.jsx and Articles.jsx). */}
          <Route path="/hi/articles" element={<Articles />} />
          <Route path="/hi/articles/:slug" element={<ArticleDetail />} />
          <Route
            path="/curtain-size-calculator"
            element={<CurtainSizeCalculator />}
          />
          <Route path="/rewards" element={<Rewards />} />
          {/* Product Details */}
          <Route path="/product/:id/:slug?" element={<ProductDetails />} />
          <Route path="/trending" element={<TrendingPage />} />
          <Route path="/clearance-sale" element={<ClearanceSalePage />} />
          <Route path="/new-arrivals" element={<NewArrivalsPage />} />
          <Route path="/gifting" element={<GiftingPage />} />
          <Route path="/price/:maxPrice" element={<PriceRangePage />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/category/:categorySlug" element={<CategoryPage />} />
          <Route
            path="/category/:categorySlug/:subcategorySlug"
            element={<CategoryPage />}
          />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* ================= ADMIN LOGIN ================= */}

        <Route path="/admin/login" element={<AdminLogin />} />

        {/* ================= ADMIN PANEL ================= */}

        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/add" element={<AddProduct />} />
          <Route path="products/edit/:id" element={<EditProduct />} />
          <Route path="products/bulk-import" element={<AdminBulkImport />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route
            path="new-arrivals"
            element={<AdminNewArrivalsSections />}
          />
          <Route
            path="trending"
            element={<AdminTrendingByCategory />}
          />
          <Route path="subcategories" element={<AdminSubcategories />} />
          <Route path="testimonials" element={<AdminTestimonials />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="questions" element={<AdminQuestions />} />
          <Route path="pages" element={<AdminPages />} />
          <Route path="articles" element={<AdminArticles />} />
          <Route path="articles/add" element={<AdminArticleForm />} />
          <Route path="articles/edit/:id" element={<AdminArticleForm />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="newsletter" element={<AdminNewsletter />} />
          <Route path="rewards-settings" element={<AdminRewardsSettings />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="footer-links" element={<AdminFooterLinks />} />
          <Route path="banners" element={<AdminBanners />} />
          <Route path="price-ranges" element={<AdminPriceRanges />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="categories/add" element={<AddCategory />} />
          <Route path="categories/edit/:id" element={<EditCategory />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="change-password" element={<AdminChangePassword />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="customers/:id" element={<CustomerDetails />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="tickets/:id" element={<AdminTicketDetail />} />
          <Route path="returns" element={<AdminReturns />} />
          <Route path="pos" element={<AdminPOS />} />
          <Route path="pos/:id" element={<AdminPOS />} />
          <Route path="walkthrough" element={<AdminWalkthrough />} />
          <Route path="print-labels" element={<PrintLabels />} />
          <Route path="products/:id/qr" element={<ProductQRLabel />} />
          <Route path="staff-users" element={<AdminStaffUsers />} />
          <Route path="roles" element={<AdminRoles />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
