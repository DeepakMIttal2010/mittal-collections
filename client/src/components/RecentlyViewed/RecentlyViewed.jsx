import { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

import { getProductById } from "../../services/productService";
import { getRecentlyViewed } from "../../utils/recentlyViewed";
import ProductCard from "../ProductCard/ProductCard";

function RecentlyViewed({ excludeId }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const ids = getRecentlyViewed().filter((id) => id !== excludeId);

      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      const responses = await Promise.all(ids.map((id) => getProductById(id)));

      const found = responses
        .filter((r) => r.success && r.product?.isActive)
        .map((r) => r.product);

      setProducts(found);
      setLoading(false);
    };

    load();
  }, [excludeId]);

  const scroll = (direction) => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollBy({
      left: direction === "next" ? 300 : -300,
      behavior: "smooth",
    });
  };

  if (loading || products.length === 0) return null;

  return (
    <section className="py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
            Recently Viewed
          </h2>

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
              className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
            >
              <FaChevronRight className="text-xs" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto scroll-smooth pb-2"
        >
          {products.map((product) => (
            <div key={product._id} className="w-64 shrink-0">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default RecentlyViewed;
