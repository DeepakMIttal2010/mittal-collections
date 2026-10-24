// The coupon fields CouponBanner renders, validated -- shared by the
// component (runtime API response, localStorage cache, build snapshot) and
// scripts/fetch-banner-coupon.mjs (which writes the snapshot), so a
// malformed value from any of those sources is treated the same way.
// Returns null for anything that shouldn't show a banner.
export const toBannerCoupon = (coupon) => {
  if (!coupon || typeof coupon !== "object") return null;
  if (coupon.isActive === false || coupon.showAsBanner === false) return null;
  if (typeof coupon.code !== "string" || !coupon.code.trim()) return null;
  if (coupon.discountType !== "percentage" && coupon.discountType !== "flat") return null;
  if (typeof coupon.discountValue !== "number" || !(coupon.discountValue > 0)) return null;

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscount: typeof coupon.maxDiscount === "number" && coupon.maxDiscount > 0 ? coupon.maxDiscount : null,
    firstOrderOnly: Boolean(coupon.firstOrderOnly),
  };
};

// Reads a GET /api/coupons/banner body. ok:false means the body can't be
// trusted (keep whatever is already known); ok:true with coupon:null means
// the API positively says there is no banner coupon right now.
export const parseBannerCouponResponse = (data) => {
  if (!data || typeof data !== "object" || data.success !== true || !("coupon" in data)) return { ok: false };
  if (data.coupon === null) return { ok: true, coupon: null };
  if (data.coupon && typeof data.coupon === "object" && (data.coupon.isActive === false || data.coupon.showAsBanner === false)) {
    return { ok: true, coupon: null };
  }
  const coupon = toBannerCoupon(data.coupon);
  return coupon ? { ok: true, coupon } : { ok: false };
};
