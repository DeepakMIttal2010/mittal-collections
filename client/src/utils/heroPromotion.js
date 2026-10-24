// GA4 promotion tracking for the homepage hero carousel
// (view_promotion / select_promotion). Plain functions with no React or
// browser dependencies so the rules can be unit tested; Hero.jsx wires
// them to the carousel and utils/analytics.js sends the events.

const NOT_SET = "(not set)";

// Same breakpoints the layout uses (Tailwind md = 768px, lg = 1024px).
export const deviceCategory = (width) => {
  if (!(width > 0)) return "desktop";
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
};

// Stable banner id: the database _id; failing that, the image's file
// name (survives reordering, unlike the array index).
const promotionId = (slide) => {
  if (typeof slide._id === "string" && slide._id.trim()) return slide._id.trim();
  const file = typeof slide.image === "string" ? slide.image.split("?")[0].split("/").pop() : "";
  const name = file ? file.replace(/\.[a-z0-9]+$/i, "") : "";
  return name || NOT_SET;
};

const promotionName = (slide) => {
  const text = [slide.title, slide.subtitle].find((v) => typeof v === "string" && v.trim());
  return text ? text.replace(/\s+/g, " ").trim() : NOT_SET;
};

// null for the bundled placeholder slide (Hero.jsx's FALLBACK_SLIDE),
// which isn't a banner anyone created and shouldn't show up in reports.
export const heroPromotionParams = (slide, index, width) => {
  if (!slide || slide._id === "fallback") return null;
  return {
    promotion_id: promotionId(slide),
    promotion_name: promotionName(slide),
    creative_slot: `homepage_hero_${index + 1}`,
    device: deviceCategory(width),
  };
};

// One tracker per page load (Hero mount). Call it whenever the active
// slide or the hero's visibility changes; it sends view_promotion only
// for a slide that is on screen right now and hasn't been sent before,
// so autoplay, manual navigation, revisits and React re-renders can't
// produce duplicates.
export const createHeroViewTracker = (send) => {
  const seen = new Set();
  return ({ slides, activeIndex, visible, width }) => {
    if (!visible || !Array.isArray(slides)) return null;
    const params = heroPromotionParams(slides[activeIndex], activeIndex, width);
    if (!params || seen.has(params.promotion_id)) return null;
    seen.add(params.promotion_id);
    send(params);
    return params;
  };
};
