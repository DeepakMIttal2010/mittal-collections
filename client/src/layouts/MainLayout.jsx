import { Outlet } from "react-router-dom";

import Header from "../components/Header/Header";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import CartDrawer from "../components/Cart/CartDrawer";
import CouponBanner from "../components/CouponBanner";
import DeliveryOfferBanner from "../components/DeliveryOfferBanner";
import RewardsPromoPopup from "../components/RewardsPromoPopup";

function MainLayout() {
  return (
    <>
      <DeliveryOfferBanner />
      <CouponBanner />
      <Header />
      <Navbar />

      <Outlet />

      <Footer />

      <CartDrawer />
      <RewardsPromoPopup />
    </>
  );
}

export default MainLayout;
