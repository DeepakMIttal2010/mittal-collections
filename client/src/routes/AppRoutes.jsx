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
import ProductDetails from "../pages/ProductDetails";
import Checkout from "../pages/Checkout";
import MyOrders from "../pages/MyOrders";

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

import AdminOrders from "../pages/admin/AdminOrders";

import AdminProfile from "../pages/admin/AdminProfile";

import AdminCustomers from "../pages/admin/AdminCustomers";
import CustomerDetails from "../pages/admin/CustomerDetails";

function AppRoutes() {
  return (
    <Routes>
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
      <Route path="/my-orders" element={<MyOrders />} />
      {/* Product Details */}
      <Route path="/product/:id" element={<ProductDetails />} />

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
        <Route path="categories/add" element={<AddCategory />} />
        <Route path="categories/edit/:id" element={<EditCategory />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="customers/:id" element={<CustomerDetails />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
