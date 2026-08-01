import { Outlet } from "react-router-dom";

import Header from "../components/Header/Header";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import CartDrawer from "../components/Cart/CartDrawer";
import CouponBanner from "../components/CouponBanner";

function MainLayout() {
  return (
    <>
      <CouponBanner />
      <Header />
      <Navbar />

      <Outlet />

      <Footer />

      <CartDrawer />
    </>
  );
}

export default MainLayout;
