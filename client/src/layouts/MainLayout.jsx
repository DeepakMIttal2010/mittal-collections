import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import Header from "../components/Header/Header";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import CartDrawer from "../components/Cart/CartDrawer";
import CouponBanner from "../components/CouponBanner";
import DeliveryOfferBanner from "../components/DeliveryOfferBanner";
import WelcomeBenefitsPopup from "../components/WelcomeBenefitsPopup";
import ErrorBoundary from "../components/ErrorBoundary";
import MobileMenu from "../components/MobileMenu";
import MobileAccountMenu from "../components/AccountMenu/MobileAccountMenu";
import BottomNav from "../components/BottomNav/BottomNav";

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
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <>
      <DeliveryOfferBanner />
      <CouponBanner />
      <ErrorBoundary resetKey={pathname} fallback={<HeaderFallback />}>
        <Header />
      </ErrorBoundary>
      <Navbar />

      {/* pb-20 on mobile reserves the same footprint BackToTopButton/
          WhatsAppButton float in (bottom-20, w-11 h-11) so a page whose
          own content happens to end right there -- Cart's totals/Checkout
          button, Login's "Forgot password?" link, the last row of a
          product grid -- never renders underneath them. Confirmed live
          (mobile audit, 2026-09-27): without this, both buttons covered
          real text/controls on Cart, Category, Search and Login at
          360-412px, on Cart even overlapping the Checkout button itself. */}
      <main className="pb-20 md:pb-0">
        <Outlet />
      </main>

      <Footer />

      {/* Spacer so the fixed BottomNav never covers the last bit of
          footer content on mobile. */}
      <div className="h-20 md:hidden" />

      <CartDrawer />
      <WelcomeBenefitsPopup />

      <MobileMenu
        isOpen={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />
      <MobileAccountMenu
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
      />
      <BottomNav
        categoriesOpen={categoriesOpen}
        onOpenCategories={() => setCategoriesOpen(true)}
        accountOpen={accountOpen}
        onOpenAccount={() => setAccountOpen(true)}
      />
    </>
  );
}

export default MainLayout;
