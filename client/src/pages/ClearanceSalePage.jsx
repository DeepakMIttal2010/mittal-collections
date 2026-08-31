import { useEffect, useState } from "react";

import { getBigSavingsProducts } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

// Mirrors TrendingPage/NewArrivalsPage — each category's section shows
// PAGE_SIZE products by default; "Show More" reveals another PAGE_SIZE at
// a time from what's already been fetched. Not admin-curated — any
// category with a 35%+ discounted item shows up automatically (see
// getBigSavingsProducts), ordered by discounted-item count, most first.
const PAGE_SIZE = 8;
const FETCH_LIMIT = 40;

function ClearanceSalePage() {
  const [sections, setSections] = useState([]);
  const [visibleCounts, setVisibleCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    getBigSavingsProducts(FETCH_LIMIT).then((response) => {
      if (response.success) {
        setSections(response.sections);
        setVisibleCounts(
          Object.fromEntries(
            response.sections.map((s) => [s.category._id, PAGE_SIZE]),
          ),
        );
      }
      setLoading(false);
    });
  }, []);

  const showMore = (categoryId, total) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [categoryId]: Math.min((prev[categoryId] || PAGE_SIZE) + PAGE_SIZE, total),
    }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Seo
        title="Clearance Sale"
        description="More than 35% off select home furnishing items at Mittal Collections — limited stock, won't be restocked at this price."
        url="https://www.mittalcollections.com/clearance-sale"
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        🔥 {t("Clearance Sale", "क्लीयरेंस सेल")}
      </h1>
      <p className="text-slate-500 mb-10">
        {t(
          "More than 35% Off — limited stock, won't be restocked at this price.",
          "35% से ज़्यादा की छूट — सीमित स्टॉक, इस कीमत पर दोबारा नहीं मिलेगा।",
        )}
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : sections.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {t(
            "No clearance items right now — check back soon!",
            "अभी कोई क्लीयरेंस आइटम नहीं है — जल्द ही वापस देखें!",
          )}
        </p>
      ) : (
        <div className="space-y-16">
          {sections.map(({ category, products }) => {
            const visibleCount = visibleCounts[category._id] || PAGE_SIZE;
            const visibleProducts = products.slice(0, visibleCount);
            const hasMore = products.length > visibleCount;

            return (
              <section key={category._id}>
                <h2 className="text-2xl font-bold text-slate-900 mb-6">
                  {t(category.name, category.nameHi)}
                </h2>

                <ProductGrid products={visibleProducts} />

                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button
                      type="button"
                      onClick={() => showMore(category._id, products.length)}
                      className="border-2 border-blue-700 text-blue-700 hover:bg-blue-50 font-semibold px-8 py-2.5 rounded-full transition-colors"
                    >
                      {t("Show More", "और दिखाएं")}
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ClearanceSalePage;
