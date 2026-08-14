import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";

import { getBannerCoupon } from "../services/couponService";

const DISMISS_KEY = "mc_banner_dismissed_code";

function CouponBanner() {
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
      ? `₹${coupon.discountValue} OFF`
      : `${coupon.discountValue}% OFF`;

  return (
    <div className="relative bg-teal-700 text-white text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
        <span className="shrink-0">🎁</span>
        <span>
          <strong>
            {discountLabel} on {coupon.firstOrderOnly ? "First Order" : "Your Order"}
          </strong>{" "}
          — Use <strong className="tracking-wide">{coupon.code}</strong>
          {coupon.maxDiscount ? ` | Up to ₹${coupon.maxDiscount}` : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
      >
        <FaTimes />
      </button>
    </div>
  );
}

export default CouponBanner;
