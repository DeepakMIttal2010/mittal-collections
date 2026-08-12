import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronLeft, FaChevronRight, FaTag } from "react-icons/fa";

import { getPriceRanges } from "../../services/priceRangeService";
import { useLanguage } from "../../context/LanguageContext";

const CARD_THEMES = [
  "from-amber-500 to-orange-600",
  "from-rose-500 to-red-600",
  "from-teal-500 to-emerald-600",
  "from-indigo-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
];

function PriceShowcase() {
  const [priceRanges, setPriceRanges] = useState([]);
  const scrollRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    const load = async () => {
      const response = await getPriceRanges();

      if (response.success) setPriceRanges(response.priceRanges);
    };

    load();
  }, []);

  const scroll = (direction) => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollBy({
      left: direction === "next" ? 280 : -280,
      behavior: "smooth",
    });
  };

  if (priceRanges.length === 0) return null;

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-slate-900">
            {t("Shop by Price", "कीमत अनुसार खरीदें")}
          </h2>

          <div className="flex items-center gap-2">
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
          className="flex gap-6 overflow-x-auto scroll-smooth pb-2"
        >
          {priceRanges.map((range, index) => (
            <button
              key={range._id}
              type="button"
              onClick={() => navigate(`/price/${range.maxPrice}`)}
              className={`shrink-0 w-40 h-48 rounded-2xl bg-gradient-to-br ${
                CARD_THEMES[index % CARD_THEMES.length]
              } text-white flex flex-col items-center justify-center shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200`}
            >
              <FaTag className="text-2xl mb-3 opacity-80" />
              <span className="text-xs font-semibold tracking-widest opacity-90">
                {t("UNDER", "तक")}
              </span>
              <span className="text-3xl font-extrabold mt-1">
                ₹{range.maxPrice}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default PriceShowcase;
