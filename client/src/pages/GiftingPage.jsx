import { useEffect, useState } from "react";

import { getGiftingProducts } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

// Deliberately flat, not grouped by category (unlike NewArrivalsPage/
// ClearanceSalePage) — gifting spans arbitrary categories, so there's no
// natural per-category section to group by here.
const PAGE_SIZE = 12;
const FETCH_LIMIT = 60;

function GiftingPage() {
  const [products, setProducts] = useState([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    getGiftingProducts(FETCH_LIMIT).then((response) => {
      if (response.success) {
        setProducts(response.products);
      }
      setLoading(false);
    });
  }, []);

  const visibleProducts = products.slice(0, visibleCount);
  const hasMore = products.length > visibleCount;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Seo
        title="Gifting"
        description="Ready-to-gift home furnishing picks at Mittal Collections — housewarmings, weddings and festive occasions, no separate wrapping needed."
        url="https://www.mittalcollections.com/gifting"
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        🎁 {t("Gifting", "गिफ्टिंग")}
      </h1>
      <p className="text-slate-500 mb-10">
        {t(
          "Ready-to-gift picks for housewarmings, weddings and festive occasions.",
          "हाउसवार्मिंग, शादी और त्योहारों के लिए तैयार गिफ्ट पसंद।",
        )}
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : products.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {t(
            "No gifting picks right now — check back soon!",
            "अभी कोई गिफ्टिंग आइटम नहीं है — जल्द ही वापस देखें!",
          )}
        </p>
      ) : (
        <>
          <ProductGrid products={visibleProducts} />

          {hasMore && (
            <div className="flex justify-center mt-8">
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((prev) =>
                    Math.min(prev + PAGE_SIZE, products.length),
                  )
                }
                className="border-2 border-blue-700 text-blue-700 hover:bg-blue-50 font-semibold px-8 py-2.5 rounded-full transition-colors"
              >
                {t("Show More", "और दिखाएं")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default GiftingPage;
