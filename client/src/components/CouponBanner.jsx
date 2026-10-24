import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";

import { getBannerCoupon } from "../services/couponService";
import { useLanguage } from "../context/LanguageContext";
import { parseBannerCouponResponse, toBannerCoupon } from "../utils/bannerCoupon";
import bannerCouponSnapshot from "../data/bannerCouponSnapshot.json";

const DISMISS_KEY = "mc_banner_dismissed_code";
// Caches the last-seen coupon so the banner can render WITH content on
// the very first paint instead of null-then-pop-in once getBannerCoupon()
// resolves — that pop-in sits above Header/Navbar/Hero (see MainLayout),
// so it was pushing all of them down after first paint, a real CLS hit.
// The active coupon rarely changes between visits, so this is right most
// of the time; the effect below still re-fetches and self-corrects if
// it's stale. "null" in the cache means the API said there is no banner
// coupon -- remembered, so a returning visitor doesn't fall back to a
// stale build snapshot.
const CACHE_KEY = "mc_banner_coupon_cache";

// undefined = nothing cached (or unreadable); null = known "no coupon".
const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw);
    return parsed === null ? null : toBannerCoupon(parsed) || undefined;
  } catch {
    return undefined;
  }
};

const writeCache = (coupon) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(coupon));
  } catch {
    /* private-mode/quota — cache is a best-effort optimization only */
  }
};

// The cache only exists for a returning visitor, so a first-time visitor
// (and every Lighthouse run) used to render nothing here until the API
// answered -- the homepage's biggest layout shift (2026-10-24). The build
// snapshot (scripts/fetch-banner-coupon.mjs) gives that first paint the
// coupon that was live at deploy time; the effect below corrects it.
const getInitialCoupon = () => {
  const cached = readCache();
  return cached !== undefined ? cached : toBannerCoupon(bannerCouponSnapshot?.coupon);
};

const isDismissed = (coupon) => {
  try {
    return Boolean(coupon) && sessionStorage.getItem(DISMISS_KEY) === coupon.code;
  } catch {
    return false;
  }
};

function CouponBanner() {
  const { t } = useLanguage();
  const [coupon, setCoupon] = useState(getInitialCoupon);
  // Checked against whichever coupon is shown first (cache or snapshot),
  // so a coupon dismissed this session never flashes back in.
  const [dismissed, setDismissed] = useState(() => isDismissed(getInitialCoupon()));

  useEffect(() => {
    const load = async () => {
      const parsed = parseBannerCouponResponse(await getBannerCoupon());

      // An unreachable API or an unexpected body says nothing about the
      // coupon -- keep what's showing (removing it would shift the page
      // up, the same CLS this component is built to avoid).
      if (!parsed.ok) return;

      setCoupon(parsed.coupon);
      writeCache(parsed.coupon);
      setDismissed(isDismissed(parsed.coupon));
    };

    load();
  }, []);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, coupon.code);
    } catch {
      /* storage blocked -- still hide it for this page view */
    }
    setDismissed(true);
  };

  if (!coupon || dismissed) return null;

  const discountLabel =
    coupon.discountType === "flat"
      ? t(`₹${coupon.discountValue} OFF`, `₹${coupon.discountValue} की छूट`)
      : t(`${coupon.discountValue}% OFF`, `${coupon.discountValue}% छूट`);

  return (
    <div className="relative text-teal-800 text-sm border-b border-slate-100" data-testid="coupon-banner">
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
