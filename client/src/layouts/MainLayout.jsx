import { Link, Outlet, useLocation } from "react-router-dom";

import Header from "../components/Header/Header";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import CartDrawer from "../components/Cart/CartDrawer";
import CouponBanner from "../components/CouponBanner";
import DeliveryOfferBanner from "../components/DeliveryOfferBanner";
import WelcomeBenefitsPopup from "../components/WelcomeBenefitsPopup";
import ErrorBoundary from "../components/ErrorBoundary";

// If the header ever crashes (it has, before — a missing translation
// destructure once blanked the whole site) this keeps at least a
// working home link on screen instead of losing all navigation.
function HeaderFallback() {
  return (
    <div className="border-b border-slate-200 px-4 py-4">
      <Link to="/" className="text-xl font-bold text-slate-900">
        Mittal Collections
      </Link>
    </div>
  );
}

function MainLayout() {
  const { pathname } = useLocation();

  return (
    <>
      <DeliveryOfferBanner />
      <CouponBanner />
      <ErrorBoundary resetKey={pathname} fallback={<HeaderFallback />}>
        <Header />
      </ErrorBoundary>
      <Navbar />

      <Outlet />

      <Footer />

      <CartDrawer />
      <WelcomeBenefitsPopup />
    </>
  );
}

export default MainLayout;
