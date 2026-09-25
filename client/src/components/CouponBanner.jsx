import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";

import { getBannerCoupon } from "../services/couponService";
import { useLanguage } from "../context/LanguageContext";

const DISMISS_KEY = "mc_banner_dismissed_code";
// Caches the last-seen coupon so the banner can render WITH content on
// the very first paint instead of null-then-pop-in once getBannerCoupon()
// resolves — that pop-in sits above Header/Navbar/Hero (see MainLayout),
// so it was pushing all of them down after first paint, a real CLS hit.
// The active coupon rarely changes between visits, so this is right most
// of the time; the effect below still re-fetches and self-corrects
// (including clearing the cache) if it's stale.
const CACHE_KEY = "mc_banner_coupon_cache";

const getCachedCoupon = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

function CouponBanner() {
  const { t } = useLanguage();
  const [coupon, setCoupon] = useState(getCachedCoupon);
  const [dismissed, setDismissed] = useState(() => {
    const cached = getCachedCoupon();
    return cached ? sessionStorage.getItem(DISMISS_KEY) === cached.code : false;
  });

  useEffect(() => {
    const load = async () => {
      const response = await getBannerCoupon();

      if (response.success && response.coupon) {
        setCoupon(response.coupon);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(response.coupon));
        } catch {
          /* private-mode/quota — cache is a best-effort optimization only */
        }

        setDismissed(sessionStorage.getItem(DISMISS_KEY) === response.coupon.code);
      } else {
        setCoupon(null);
        try {
          localStorage.removeItem(CACHE_KEY);
        } catch {
          /* private-mode/quota — cache is a best-effort optimization only */
        }
      }
    };

    load();
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, coupon.code);
    setDismissed(true);
  };

  if (!coupon || dismissed) return null;

  const discountLabel =
    coupon.discountType === "flat"
      ? t(`₹${coupon.discountValue} OFF`, `₹${coupon.discountValue} की छूट`)
      : t(`${coupon.discountValue}% OFF`, `${coupon.discountValue}% छूट`);

  return (
    <div className="relative text-teal-800 text-sm border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
        <span className="shrink-0">🎁</span>
        <span>
          <strong>
            {t(
              `${discountLabel} on ${coupon.firstOrderOnly ? "First Order" : "Your Order"}`,
              `${coupon.firstOrderOnly ? "पहले ऑर्डर" : "आपके ऑर्डर"} पर ${discountLabel}`,
            )}
          </strong>{" "}
          — {t("Use ", "इस्तेमाल करें ")}<strong className="tracking-wide">{coupon.code}</strong>
          {coupon.maxDiscount ? t(` | Up to ₹${coupon.maxDiscount}`, ` | ₹${coupon.maxDiscount} तक`) : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t("Dismiss", "बंद करें")}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-800/60 hover:text-teal-800"
      >
        <FaTimes />
      </button>
    </div>
  );
}

export default CouponBanner;
