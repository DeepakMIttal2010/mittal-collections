import { Routes, Route, Navigate } from "react-router-dom";

import Home from "../pages/Home";
import About from "../pages/About";
import Contact from "../pages/Contact";
import Cart from "../pages/Cart";
import Wishlist from "../pages/Wishlist";
import Login from "../pages/Login";
import Register from "../pages/Register";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import ChangePassword from "../pages/ChangePassword";
import Account from "../pages/Account";
import LoyaltyHistory from "../pages/LoyaltyHistory";
import EditProfile from "../pages/EditProfile";
import Addresses from "../pages/Addresses";
import AddressForm from "../pages/AddressForm";
import ProductDetails from "../pages/ProductDetails";
import TrendingPage from "../pages/TrendingPage";
import PriceRangePage from "../pages/PriceRangePage";
import SearchResults from "../pages/SearchResults";
import CategoryPage from "../pages/CategoryPage";
import Checkout from "../pages/Checkout";
import MyOrders from "../pages/MyOrders";
import OrderDetails from "../pages/OrderDetails";
import PolicyPage from "../pages/PolicyPage";
import Articles from "../pages/Articles";
import ArticleDetail from "../pages/ArticleDetail";
import NotFound from "../pages/NotFound";
import MainLayout from "../layouts/MainLayout";

import AdminProtectedRoute from "./AdminProtectedRoute";
import AdminLogin from "../pages/admin/AdminLogin";
import AdminDashboard from "../pages/admin/AdminDashboard";
import AdminProducts from "../pages/admin/AdminProducts";
import AdminLayout from "../layouts/AdminLayout";

import AddProduct from "../pages/admin/AddProduct";
import EditProduct from "../pages/admin/EditProduct";
import AdminBulkImport from "../pages/admin/AdminBulkImport";

import AdminCategories from "../pages/admin/AdminCategories";
import AddCategory from "../pages/admin/AddCategory";
import EditCategory from "../pages/admin/EditCategory";

import AdminSubcategories from "../pages/admin/AdminSubcategories";
import AdminTestimonials from "../pages/admin/AdminTestimonials";
import AdminReviews from "../pages/admin/AdminReviews";
import AdminQuestions from "../pages/admin/AdminQuestions";
import AdminPages from "../pages/admin/AdminPages";
import AdminArticles from "../pages/admin/AdminArticles";
import AdminArticleForm from "../pages/admin/AdminArticleForm";
import AdminSettings from "../pages/admin/AdminSettings";
import AdminNewsletter from "../pages/admin/AdminNewsletter";
import AdminRewardsSettings from "../pages/admin/AdminRewardsSettings";
import AdminMessages from "../pages/admin/AdminMessages";
import AdminFooterLinks from "../pages/admin/AdminFooterLinks";
import AdminBanners from "../pages/admin/AdminBanners";
import AdminPriceRanges from "../pages/admin/AdminPriceRanges";
import AdminCoupons from "../pages/admin/AdminCoupons";

import AdminOrders from "../pages/admin/AdminOrders";

import AdminProfile from "../pages/admin/AdminProfile";
import AdminChangePassword from "../pages/admin/AdminChangePassword";

import AdminCustomers from "../pages/admin/AdminCustomers";
import CustomerDetails from "../pages/admin/CustomerDetails";
import AdminReports from "../pages/admin/AdminReports";

function AppRoutes() {
  return (
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
        <Route path="/offers" element={<Navigate to="/trending" replace />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/wishlist" element={<Wishlist />} />
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
        <Route path="/policies/:slug" element={<PolicyPage />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/:slug" element={<ArticleDetail />} />
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
      </Route>
    </Routes>
  );
}

export default AppRoutes;
