import { imgUrl } from "../../services/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight, FaFire } from "react-icons/fa";

import { getTrendingProductsByCategory } from "../../services/productService";
import Skeleton from "../Skeleton";
import { productUrl } from "../../utils/productUrl";
import { useLanguage } from "../../context/LanguageContext";

const timeAgo = (dateString, t) => {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);

  if (seconds < 60) return t("just now", "अभी अभी");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t(`${minutes}m ago`, `${minutes} मिनट पहले`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(`${hours}h ago`, `${hours} घंटे पहले`);
  const days = Math.floor(hours / 24);
  if (days === 1) return t("today", "आज");
  if (days < 7) return t(`${days}d ago`, `${days} दिन पहले`);
  return new Date(dateString).toLocaleDateString();
};

function TrendingCategoryRow({ category, products, t, isFirst }) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollBy({
      left: direction === "next" ? 300 : -300,
      behavior: "smooth",
    });
  };

  return (
    <div className={isFirst ? "" : "mt-12"}>
      <div className="flex items-center justify-between gap-4 mb-1">
        <h3 className="text-xl md:text-2xl font-bold text-slate-900">
          {category.name}
        </h3>

        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll("prev")}
            aria-label="Previous"
            className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
          >
            <FaChevronLeft className="text-xs" />
          </button>
          <button
            type="button"
            onClick={() => scroll("next")}
            aria-label="Next"
            className="w-9 h-9 rounded-full border border-amber-600 text-amber-600 hover:bg-amber-50 flex items-center justify-center"
          >
            <FaChevronRight className="text-xs" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto scroll-smooth pt-5 pb-4 pl-3"
      >
        {products.map((product, index) => (
          <Link
            key={product._id}
            to={productUrl(product)}
            className="relative shrink-0 w-48 sm:w-60"
          >
            <div className="relative rounded-xl overflow-hidden shadow-md aspect-[4/5] bg-slate-100">
              <img
                src={`${imgUrl(product.image)}`}
                alt={product.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />

              <span className="absolute top-3 right-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded">
                {t("TRENDING", "ट्रेंडिंग")}
              </span>

              <p className="absolute bottom-3 left-3 right-3 text-white text-sm font-semibold leading-snug line-clamp-2">
                {product.name}
              </p>
            </div>

            <span
              aria-hidden="true"
              className="absolute -top-3 -left-3 z-10 w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-red-600 text-white font-extrabold text-base flex items-center justify-center shadow-lg border-2 border-white select-none"
            >
              {index + 1}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TrendingSection() {
  const [sections, setSections] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    const loadTrending = async () => {
      const response = await getTrendingProductsByCategory(10);

      if (response.success) {
        setSections(response.sections);
        setLastUpdated(response.lastUpdated);
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
            <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
              {t("on Mittal Collections", "मित्तल कलेक्शंस पर")}
              {lastUpdated && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {t("Updated", "अपडेट किया गया")} {timeAgo(lastUpdated, t)}
                </>
              )}
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
          <div className="flex gap-6 overflow-x-auto pt-5 pb-4 pl-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton
                key={index}
                className="shrink-0 w-48 sm:w-60 aspect-[4/5] rounded-xl"
              />
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

        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
          <FaFire className="text-amber-500" />
          {t("Handpicked by our team", "हमारी टीम द्वारा चुने गए")}
        </p>
      </div>
    </section>
  );
}

export default TrendingSection;
