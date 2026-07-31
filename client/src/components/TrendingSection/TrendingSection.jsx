import { SERVER_URL } from "../../services/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight, FaFire } from "react-icons/fa";

import { getTrendingProducts } from "../../services/productService";

const timeAgo = (dateString) => {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "today";
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
};

function TrendingSection() {
  const [products, setProducts] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const loadTrending = async () => {
      const response = await getTrendingProducts(10);

      if (response.success) {
        setProducts(response.products);
        setLastUpdated(response.lastUpdated);
      }
    };

    loadTrending();
  }, []);

  const scroll = (direction) => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollBy({
      left: direction === "next" ? 300 : -300,
      behavior: "smooth",
    });
  };

  if (products.length === 0) return null;

  return (
    <section className="py-20 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-2">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900">
              Top Trending
            </h2>
            <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
              on Mittal Collections
              {lastUpdated && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Updated {timeAgo(lastUpdated)}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/trending"
              className="inline-flex items-center border border-slate-300 rounded-full px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              Browse all trending
            </Link>

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
        </div>

        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto scroll-smooth pt-5 pb-4 pl-3"
        >
          {products.map((product, index) => (
            <Link
              key={product._id}
              to={`/product/${product._id}`}
              className="relative shrink-0 w-48 sm:w-60"
            >
              <div className="relative rounded-xl overflow-hidden shadow-md aspect-[4/5] bg-slate-100">
                <img
                  src={`${SERVER_URL}${product.image}`}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />

                <span className="absolute top-3 right-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded">
                  TRENDING
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

        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
          <FaFire className="text-amber-500" />
          Handpicked by our team
        </p>
      </div>
    </section>
  );
}

export default TrendingSection;
