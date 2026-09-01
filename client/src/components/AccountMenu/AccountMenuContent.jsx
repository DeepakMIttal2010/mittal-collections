import { Link } from "react-router-dom";

import { useInstallClickHandler } from "../../hooks/useInstallClickHandler";
import { useGoToRecentlyViewed } from "../../hooks/useGoToRecentlyViewed";

// Shared list of account-menu items — the desktop header hover dropdown
// and the mobile account drawer both render this, so the two never
// drift out of sync with each other again (see MEMORY.md-style lesson:
// two entry points for the same menu had already diverged once).
function AccountMenuContent({ isLoggedIn, user, logout, t, onNavigate }) {
  const handleInstallClick = useInstallClickHandler();
  const goToRecentlyViewed = useGoToRecentlyViewed();

  const itemClass =
    "block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600";

  if (isLoggedIn) {
    return (
      <>
        <div className="px-4 py-2 text-sm text-slate-500 border-b border-slate-100 truncate">
          {t("Hi, ", "नमस्ते, ")}
          {user?.name}
        </div>

        <Link to="/account" onClick={onNavigate} className={`${itemClass} font-medium text-slate-800`}>
          {t("My Account", "मेरा खाता")}
        </Link>

        <Link to="/my-orders" onClick={onNavigate} className={itemClass}>
          {t("My Orders", "मेरे ऑर्डर")}
        </Link>

        <Link to="/wishlist" onClick={onNavigate} className={itemClass}>
          {t("Wishlist", "विशलिस्ट")}
        </Link>

        <Link to="/change-password" onClick={onNavigate} className={itemClass}>
          {t("Change Password", "पासवर्ड बदलें")}
        </Link>

        <button
          type="button"
          onClick={() => {
            handleInstallClick();
            onNavigate?.();
          }}
          className={`w-full text-left ${itemClass}`}
        >
          {t("Download the App", "ऐप डाउनलोड करें")}
        </button>

        <button
          type="button"
          onClick={() => {
            logout();
            onNavigate?.();
          }}
          className={`w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-slate-50`}
        >
          {t("Logout", "लॉगआउट")}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="px-4 flex flex-col gap-2 pb-3 border-b border-slate-100">
        <Link
          to="/login"
          onClick={onNavigate}
          className="block text-center bg-blue-900 hover:bg-blue-950 text-white text-sm font-semibold rounded-full py-2 transition-colors"
        >
          {t("Sign In", "लॉगिन करें")}
        </Link>
        <Link
          to="/register"
          onClick={onNavigate}
          className="block text-center text-sm font-medium text-blue-900 hover:underline"
        >
          {t("Create an Account", "खाता बनाएं")}
        </Link>
      </div>

      <Link to="/login?redirect=/account" onClick={onNavigate} className={itemClass}>
        {t("My Account", "मेरा खाता")}
      </Link>

      <Link to="/login?redirect=/my-orders" onClick={onNavigate} className={itemClass}>
        {t("My Orders", "मेरे ऑर्डर")}
      </Link>

      <Link to="/wishlist" onClick={onNavigate} className={itemClass}>
        {t("Wishlist", "विशलिस्ट")}
      </Link>

      <Link to="/login?redirect=/my-orders" onClick={onNavigate} className={itemClass}>
        {t("Review My Purchases", "अपनी खरीद की समीक्षा करें")}
      </Link>

      <Link
        to="/#recently-viewed"
        onClick={(e) => {
          goToRecentlyViewed(e);
          onNavigate?.();
        }}
        className={itemClass}
      >
        {t("Recently Viewed", "हाल ही में देखे गए")}
      </Link>

      <Link to="/contact" onClick={onNavigate} className={itemClass}>
        {t("Help & Contact", "सहायता और संपर्क")}
      </Link>

      <div className="mt-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => {
            handleInstallClick();
            onNavigate?.();
          }}
          className={`w-full text-left ${itemClass}`}
        >
          {t("Download the App", "ऐप डाउनलोड करें")}
        </button>

        <Link to="/login?redirect=/loyalty-history" onClick={onNavigate} className={itemClass}>
          {t("Loyalty Points", "लॉयल्टी पॉइंट्स")}
        </Link>
      </div>
    </>
  );
}

export default AccountMenuContent;
