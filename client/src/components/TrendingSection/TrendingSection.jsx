import { imgUrl, imgSrcSet } from "../../services/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight, FaFire } from "react-icons/fa";

import { getTrendingProductsByCategory } from "../../services/productService";
import Skeleton from "../Skeleton";
import { productUrl } from "../../utils/productUrl";
import { useLanguage } from "../../context/LanguageContext";
import { handleImageError } from "../../utils/imageFallback";
import { useLocation } from "react-router-dom";
import { isHindiPath } from "../../utils/hindiPath";
import { verifiedMrp } from "../../utils/verifiedMrp";
import { splitVariantName } from "../../utils/trendingCard";

// Cards per category row on the homepage; /trending shows the rest.
const HOMEPAGE_LIMIT = 8;

// The rows still scroll (arrows, swipe, trackpad, keyboard focus); only the
// bar is hidden -- Windows Chrome drew a grey one under every row.
// scrollbar-width covers Firefox and current Chrome/Edge, the
// ::-webkit-scrollbar rule older Chrome and Safari.
const HIDDEN_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function TrendingCategoryRow({ category, products, t, isFirst }) {
  // A Hindi product page exists only once the product has a Hindi name.
  const isHindi = isHindiPath(useLocation().pathname);
  const scrollRef = useRef(null);

  // One card plus the gap per click (a fixed 300px left cards half
  // visible); the row snaps to card edges from sm up, where the arrows are.
  const scroll = (direction) => {
    const row = scrollRef.current;
    if (!row) return;

    const card = row.firstElementChild;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const step = card ? card.offsetWidth + gap : 300;

    row.scrollBy({
      left: direction === "next" ? step : -step,
      behavior: "smooth",
    });
  };

  return (
    <div className={isFirst ? "" : "mt-12"}>
      <div className="flex items-center justify-between gap-4 mb-1">
        <h3 className="text-xl md:text-2xl font-bold text-slate-900">
          {t(category.name, category.nameHi)}
        </h3>

        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll("prev")}
            aria-label={t("Previous", "पिछला")}
            className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
          >
            <FaChevronLeft className="text-xs" />
          </button>
          <button
            type="button"
            onClick={() => scroll("next")}
            aria-label={t("Next", "अगला")}
            className="w-9 h-9 rounded-full border border-amber-600 text-amber-600 hover:bg-amber-50 flex items-center justify-center"
          >
            <FaChevronRight className="text-xs" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`${HIDDEN_SCROLLBAR} flex gap-6 overflow-x-auto scroll-smooth pt-5 pb-4 pl-3 sm:snap-x sm:snap-mandatory sm:scroll-pl-3`}
      >
        {products.map((product) => {
          const { base, variant } = splitVariantName(t(product.name, product.nameHi));
          const mrp = verifiedMrp(product);

          return (
          <Link
            key={product._id}
            to={productUrl(product, isHindi && !!product.nameHi)}
            className="relative shrink-0 w-48 sm:w-60 sm:snap-start"
          >
            <div className="relative rounded-xl overflow-hidden shadow-md aspect-[4/5] bg-slate-100">
              <img
                src={`${imgUrl(product.image, "w_300,q_auto,f_auto")}`}
                srcSet={imgSrcSet(product.image, [200, 300, 450])}
                sizes="(min-width: 640px) 240px, 192px"
                alt={t(product.name, product.nameHi)}
                loading="lazy"
                onError={handleImageError}
                className="w-full h-full object-cover"
              />

              <span className="absolute top-3 right-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded">
                {t("TRENDING", "ट्रेंडिंग")}
              </span>
            </div>

            {/* Name below the photo with the colour/design part on its own
                line, so it is never the bit the clamp cuts off. */}
            <div className="mt-3 px-1">
              <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
                {base}
              </p>
              {variant && (
                <p className="text-xs text-slate-600 mt-0.5 truncate" title={variant}>
                  {variant}
                </p>
              )}
              {/* Selling price; strike-through MRP only when verified
                  (utils/verifiedMrp.js), same rule as ProductCard. */}
              <p className="mt-1 text-sm">
                <span className="font-bold text-slate-900">₹{product.price}</span>
                {mrp > 0 && (
                  <span className="ml-2 text-xs text-slate-500">
                    MRP <span className="line-through">₹{mrp}</span>{" "}
                    {t("(incl. of all taxes)", "(सभी करों सहित)")}
                  </span>
                )}
              </p>
            </div>

            {/* Only a real admin-set rank gets a number; rank 0 is the
                form's default, not a position. */}
            {product.trendingRank > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-3 -left-3 z-10 w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-red-600 text-white font-extrabold text-base flex items-center justify-center shadow-lg border-2 border-white select-none"
              >
                {product.trendingRank}
              </span>
            )}
          </Link>
          );
        })}
      </div>
    </div>
  );
}

function TrendingSection() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    const loadTrending = async () => {
      const response = await getTrendingProductsByCategory(HOMEPAGE_LIMIT);

      if (response.success) {
        setSections(response.sections);
      }

      setLoading(false);
    };

    loadTrending();
  }, []);

  if (!loading && sections.length === 0) return null;

  return (
    <section className="py-20 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-2">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900">
              {t("Top Trending", "सबसे ज़्यादा ट्रेंडिंग")}
            </h2>
            {/* No "Updated ..." time: it came from the newest updatedAt of
                any product shown, so a stock or price edit read as the
                selection being refreshed. */}
            <p className="text-sm text-slate-600 mt-2">
              {t("on Mittal Collections", "मित्तल कलेक्शंस पर")}
            </p>
          </div>

          <Link
            to="/trending"
            className="inline-flex items-center border border-slate-300 rounded-full px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
          >
            {t("Browse all trending", "सभी ट्रेंडिंग देखें")}
          </Link>
        </div>

        {loading ? (
          <div className={`${HIDDEN_SCROLLBAR} flex gap-6 overflow-x-auto pt-5 pb-4 pl-3`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="shrink-0 w-48 sm:w-60">
                <Skeleton className="aspect-[4/5] rounded-xl" />
                <Skeleton className="mt-3 h-4 w-11/12" />
                <Skeleton className="mt-1.5 h-3 w-2/3" />
                <Skeleton className="mt-1.5 h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          sections.map(({ category, products }, index) => (
            <TrendingCategoryRow
              key={category._id}
              category={category}
              products={products}
              t={t}
              isFirst={index === 0}
            />
          ))
        )}

        <p className="text-xs text-slate-600 mt-2 flex items-center gap-1.5">
          <FaFire className="text-amber-500" />
          {t("Handpicked by our team", "हमारी टीम द्वारा चुने गए")}
        </p>
      </div>
    </section>
  );
}

export default TrendingSection;
