import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Home from "../pages/Home";
import NotFound from "../pages/NotFound";
import MainLayout from "../layouts/MainLayout";
import PageLoader from "../components/PageLoader";

const About = lazy(() => import("../pages/About"));
const Contact = lazy(() => import("../pages/Contact"));
const Cart = lazy(() => import("../pages/Cart"));
const Wishlist = lazy(() => import("../pages/Wishlist"));
const Login = lazy(() => import("../pages/Login"));
const Register = lazy(() => import("../pages/Register"));
const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));
const ChangePassword = lazy(() => import("../pages/ChangePassword"));
const Account = lazy(() => import("../pages/Account"));
const LoyaltyHistory = lazy(() => import("../pages/LoyaltyHistory"));
const EditProfile = lazy(() => import("../pages/EditProfile"));
const Addresses = lazy(() => import("../pages/Addresses"));
const AddressForm = lazy(() => import("../pages/AddressForm"));
const ProductDetails = lazy(() => import("../pages/ProductDetails"));
const TrendingPage = lazy(() => import("../pages/TrendingPage"));
const PriceRangePage = lazy(() => import("../pages/PriceRangePage"));
const SearchResults = lazy(() => import("../pages/SearchResults"));
const CategoryPage = lazy(() => import("../pages/CategoryPage"));
const Checkout = lazy(() => import("../pages/Checkout"));
const MyOrders = lazy(() => import("../pages/MyOrders"));
const OrderDetails = lazy(() => import("../pages/OrderDetails"));
const PolicyPage = lazy(() => import("../pages/PolicyPage"));
const Articles = lazy(() => import("../pages/Articles"));
const ArticleDetail = lazy(() => import("../pages/ArticleDetail"));
const CurtainSizeCalculator = lazy(
  () => import("../pages/CurtainSizeCalculator"),
);
const Compare = lazy(() => import("../pages/Compare"));
const Tickets = lazy(() => import("../pages/Tickets"));
const TicketDetail = lazy(() => import("../pages/TicketDetail"));

const AdminProtectedRoute = lazy(() => import("./AdminProtectedRoute"));
const AdminLogin = lazy(() => import("../pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("../pages/admin/AdminProducts"));
const AdminLayout = lazy(() => import("../layouts/AdminLayout"));

const AddProduct = lazy(() => import("../pages/admin/AddProduct"));
const EditProduct = lazy(() => import("../pages/admin/EditProduct"));
const AdminBulkImport = lazy(() => import("../pages/admin/AdminBulkImport"));

const AdminCategories = lazy(() => import("../pages/admin/AdminCategories"));
const AddCategory = lazy(() => import("../pages/admin/AddCategory"));
const EditCategory = lazy(() => import("../pages/admin/EditCategory"));

const AdminSubcategories = lazy(
  () => import("../pages/admin/AdminSubcategories"),
);
const AdminTestimonials = lazy(
  () => import("../pages/admin/AdminTestimonials"),
);
const AdminReviews = lazy(() => import("../pages/admin/AdminReviews"));
const AdminQuestions = lazy(() => import("../pages/admin/AdminQuestions"));
const AdminPages = lazy(() => import("../pages/admin/AdminPages"));
const AdminArticles = lazy(() => import("../pages/admin/AdminArticles"));
const AdminArticleForm = lazy(
  () => import("../pages/admin/AdminArticleForm"),
);
const AdminSettings = lazy(() => import("../pages/admin/AdminSettings"));
const AdminNewsletter = lazy(() => import("../pages/admin/AdminNewsletter"));
const AdminRewardsSettings = lazy(
  () => import("../pages/admin/AdminRewardsSettings"),
);
const AdminMessages = lazy(() => import("../pages/admin/AdminMessages"));
const AdminFooterLinks = lazy(
  () => import("../pages/admin/AdminFooterLinks"),
);
const AdminBanners = lazy(() => import("../pages/admin/AdminBanners"));
const AdminPriceRanges = lazy(
  () => import("../pages/admin/AdminPriceRanges"),
);
const AdminCoupons = lazy(() => import("../pages/admin/AdminCoupons"));

const AdminOrders = lazy(() => import("../pages/admin/AdminOrders"));

const AdminProfile = lazy(() => import("../pages/admin/AdminProfile"));
const AdminChangePassword = lazy(
  () => import("../pages/admin/AdminChangePassword"),
);

const AdminCustomers = lazy(() => import("../pages/admin/AdminCustomers"));
const CustomerDetails = lazy(
  () => import("../pages/admin/CustomerDetails"),
);
const AdminReports = lazy(() => import("../pages/admin/AdminReports"));
const AdminTickets = lazy(() => import("../pages/admin/AdminTickets"));
const AdminTicketDetail = lazy(
  () => import("../pages/admin/AdminTicketDetail"),
);

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
          <Route path="/policies/:slug" element={<PolicyPage />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/articles/:slug" element={<ArticleDetail />} />
          <Route
            path="/curtain-size-calculator"
            element={<CurtainSizeCalculator />}
          />
          {/* Product Details */}
          <Route path="/product/:id/:slug?" element={<ProductDetails />} />
          <Route path="/trending" element={<TrendingPage />} />
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
        </Route>
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
