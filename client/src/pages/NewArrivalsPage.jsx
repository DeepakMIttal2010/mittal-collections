import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getNewArrivalsByCategory } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

const ARRIVALS_COUNT = 12;

function NewArrivalsPage() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    getNewArrivalsByCategory(ARRIVALS_COUNT).then((response) => {
      if (response.success) setSections(response.sections);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Seo
        title="New Arrivals"
        description="The newest home furnishing pieces at Mittal Collections, organised by category - bedsheets, cushion covers, doormats and more."
        url="https://www.mittalcollections.com/new-arrivals"
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        {t("New Arrivals", "नए प्रोडक्ट्स")}
      </h1>
      <p className="text-slate-500 mb-10">
        {t(
          "Fresh additions across our collection, organised by category.",
          "हमारे कलेक्शन में नए जुड़े प्रोडक्ट्स, कैटेगरी के अनुसार।",
        )}
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : sections.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {t(
            "No new arrivals right now — check back soon!",
            "अभी कोई नया प्रोडक्ट नहीं है — जल्द ही वापस देखें!",
          )}
        </p>
      ) : (
        <div className="space-y-16">
          {sections.map(({ category, products }) => (
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

              <ProductGrid products={products} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default NewArrivalsPage;
