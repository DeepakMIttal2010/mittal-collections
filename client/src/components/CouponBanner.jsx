import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";

import { getBannerCoupon } from "../services/couponService";
import { useLanguage } from "../context/LanguageContext";

const DISMISS_KEY = "mc_banner_dismissed_code";

function CouponBanner() {
  const { t } = useLanguage();
  const [coupon, setCoupon] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const load = async () => {
      const response = await getBannerCoupon();

      if (response.success && response.coupon) {
        setCoupon(response.coupon);

        if (sessionStorage.getItem(DISMISS_KEY) === response.coupon.code) {
          setDismissed(true);
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
    <div className="relative bg-teal-700 text-white text-sm">
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
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
      >
        <FaTimes />
      </button>
    </div>
  );
}

export default CouponBanner;
