import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getTrendingProductsByCategory } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

// Mirrors NewArrivalsPage — each category's section shows PAGE_SIZE
// products by default; "Show More" reveals another PAGE_SIZE at a time
// from what's already been fetched.
const PAGE_SIZE = 8;
const FETCH_LIMIT = 40;

function TrendingPage() {
  const [sections, setSections] = useState([]);
  const [visibleCounts, setVisibleCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    getTrendingProductsByCategory(FETCH_LIMIT).then((response) => {
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
        title="Top Trending"
        description="Handpicked by our team - the home furnishing pieces everyone's loving right now at Mittal Collections, organised by category."
        url="https://www.mittalcollections.com/trending"
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        {t("Top Trending", "सबसे ज़्यादा ट्रेंडिंग")}
      </h1>
      <p className="text-slate-500 mb-10">
        {t(
          "Handpicked by our team, organised by category.",
          "हमारी टीम द्वारा चुने गए, कैटेगरी के अनुसार।",
        )}
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : sections.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {t(
            "No trending products right now — check back soon!",
            "अभी कोई ट्रेंडिंग प्रोडक्ट नहीं है — जल्द ही वापस देखें!",
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
                <div className="flex items-end justify-between mb-6 gap-4">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {category.name}
                  </h2>

                  <Link
                    to={`/category/${category.slug}`}
                    className="shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap"
                  >
                    {t("View All", "सभी देखें")} →
                  </Link>
                </div>

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

export default TrendingPage;
