import { imgUrl } from "../../services/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight, FaTag } from "react-icons/fa";

import { getBigSavingsProducts } from "../../services/productService";
import Skeleton from "../Skeleton";
import { productUrl } from "../../utils/productUrl";
import { useLanguage } from "../../context/LanguageContext";

function ClearanceCategoryRow({ category, products, t, isFirst }) {
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
            className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 hover:bg-white flex items-center justify-center"
          >
            <FaChevronLeft className="text-xs" />
          </button>
          <button
            type="button"
            onClick={() => scroll("next")}
            aria-label="Next"
            className="w-9 h-9 rounded-full border border-red-600 text-red-600 hover:bg-white flex items-center justify-center"
          >
            <FaChevronRight className="text-xs" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto scroll-smooth pt-5 pb-4 pl-3"
      >
        {products.map((product) => {
          const discount = product.oldPrice
            ? Math.round(
                ((product.oldPrice - product.price) / product.oldPrice) *
                  100,
              )
            : 0;

          return (
            <Link
              key={product._id}
              to={productUrl(product)}
              className="relative shrink-0 w-48 sm:w-60"
            >
              <div className="relative rounded-xl overflow-hidden shadow-md aspect-[4/5] bg-slate-100">
                <img
                  src={`${imgUrl(product.image)}`}
                  alt={t(product.name, product.nameHi)}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />

                <span className="absolute top-3 right-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded">
                  {discount}% {t("OFF", "छूट")}
                </span>

                <p className="absolute bottom-10 left-3 right-3 text-white text-sm font-semibold leading-snug line-clamp-2">
                  {product.name}
                </p>

                <p className="absolute bottom-3 left-3 right-3 text-white text-sm flex items-center gap-2">
                  <span className="font-bold">₹{product.price}</span>
                  <span className="line-through text-white/60 text-xs">
                    ₹{product.oldPrice}
                  </span>
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Not admin-curated, unlike New Arrivals/Trending — any category with at
// least one product discounted 35%+ off MRP gets its own row here
// automatically, ordered by the server with the most-discounted category
// first (see getBigSavingsProducts).
function ClearanceSale() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    getBigSavingsProducts(10).then((response) => {
      if (response.success) setSections(response.sections);
      setLoading(false);
    });
  }, []);

  if (!loading && sections.length === 0) return null;

  return (
    <section className="py-20 bg-red-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-2">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900">
              🔥 {t("Clearance Sale", "क्लीयरेंस सेल")}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              {t(
                "More than 35% Off — limited stock, won't be restocked at this price.",
                "35% से ज़्यादा की छूट — सीमित स्टॉक, इस कीमत पर दोबारा नहीं मिलेगा।",
              )}
            </p>
          </div>

          <Link
            to="/clearance-sale"
            className="inline-flex items-center border border-slate-300 rounded-full px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-white transition-colors"
          >
            {t("Browse all clearance", "सभी क्लीयरेंस देखें")}
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
            <ClearanceCategoryRow
              key={category._id}
              category={category}
              products={products}
              t={t}
              isFirst={index === 0}
            />
          ))
        )}

        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
          <FaTag className="text-red-500" />
          {t(
            "Big discounts on select items — once sold, gone.",
            "चुनिंदा प्रोडक्ट्स पर बड़ी छूट — स्टॉक खत्म होते ही offer खत्म।",
          )}
        </p>
      </div>
    </section>
  );
}

export default ClearanceSale;
