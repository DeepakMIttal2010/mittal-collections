import { Routes, Route } from "react-router-dom";

import Home from "../pages/Home";
import Bedsheets from "../pages/Bedsheets";
import Towels from "../pages/Towels";
import Curtains from "../pages/Curtains";
import Pillows from "../pages/Pillows";
import Blankets from "../pages/Blankets";
import Offers from "../pages/Offers";
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
import PolicyPage from "../pages/PolicyPage";
import MainLayout from "../layouts/MainLayout";

import AdminProtectedRoute from "./AdminProtectedRoute";
import AdminLogin from "../pages/admin/AdminLogin";
import AdminDashboard from "../pages/admin/AdminDashboard";
import AdminProducts from "../pages/admin/AdminProducts";
import AdminLayout from "../layouts/AdminLayout";

import AddProduct from "../pages/admin/AddProduct";
import EditProduct from "../pages/admin/EditProduct";

import AdminCategories from "../pages/admin/AdminCategories";
import AddCategory from "../pages/admin/AddCategory";
import EditCategory from "../pages/admin/EditCategory";

import AdminSubcategories from "../pages/admin/AdminSubcategories";
import AdminTestimonials from "../pages/admin/AdminTestimonials";
import AdminPages from "../pages/admin/AdminPages";
import AdminSettings from "../pages/admin/AdminSettings";
import AdminMessages from "../pages/admin/AdminMessages";
import AdminFooterLinks from "../pages/admin/AdminFooterLinks";
import AdminBanners from "../pages/admin/AdminBanners";
import AdminPriceRanges from "../pages/admin/AdminPriceRanges";

import AdminOrders from "../pages/admin/AdminOrders";

import AdminProfile from "../pages/admin/AdminProfile";
import AdminChangePassword from "../pages/admin/AdminChangePassword";

import AdminCustomers from "../pages/admin/AdminCustomers";
import CustomerDetails from "../pages/admin/CustomerDetails";

function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/bedsheets" element={<Bedsheets />} />
        <Route path="/towels" element={<Towels />} />
        <Route path="/curtains" element={<Curtains />} />
        <Route path="/pillows" element={<Pillows />} />
        <Route path="/blankets" element={<Blankets />} />
        <Route path="/offers" element={<Offers />} />
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
        <Route path="/edit-profile" element={<EditProfile />} />
        <Route path="/addresses" element={<Addresses />} />
        <Route path="/addresses/add" element={<AddressForm />} />
        <Route path="/addresses/edit/:id" element={<AddressForm />} />
        <Route path="/my-orders" element={<MyOrders />} />
        <Route path="/policies/:slug" element={<PolicyPage />} />
        {/* Product Details */}
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/trending" element={<TrendingPage />} />
        <Route path="/price/:maxPrice" element={<PriceRangePage />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/category/:categorySlug" element={<CategoryPage />} />
        <Route
          path="/category/:categorySlug/:subcategorySlug"
          element={<CategoryPage />}
        />
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
        <Route path="categories" element={<AdminCategories />} />
        <Route path="subcategories" element={<AdminSubcategories />} />
        <Route path="testimonials" element={<AdminTestimonials />} />
        <Route path="pages" element={<AdminPages />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="messages" element={<AdminMessages />} />
        <Route path="footer-links" element={<AdminFooterLinks />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="price-ranges" element={<AdminPriceRanges />} />
        <Route path="categories/add" element={<AddCategory />} />
        <Route path="categories/edit/:id" element={<EditCategory />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="change-password" element={<AdminChangePassword />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="customers/:id" element={<CustomerDetails />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
