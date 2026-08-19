import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getNewArrivalsByCategory } from "../../services/productService";
import ProductGrid from "../ProductGrid/ProductGrid";
import ProductGridSkeleton from "../ProductGrid/ProductGridSkeleton";
import { useLanguage } from "../../context/LanguageContext";

const ARRIVALS_COUNT = 8;

// One "New Arrivals" section per admin-opted-in category (see Category's
// showInHomeNewArrivals, managed from /admin/new-arrivals) — replaces the
// old single site-wide section so each category gets its own newest-items
// showcase instead of one mixed feed.
function CategoryNewArrivals() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    getNewArrivalsByCategory(ARRIVALS_COUNT).then((response) => {
      if (response.success) {
        setSections(response.sections);
      }

      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <ProductGridSkeleton />
        </div>
      </section>
    );
  }

  if (sections.length === 0) return null;

  return (
    <>
      {sections.map(({ category, products }, index) => (
        <section
          key={category._id}
          className={`py-16 ${index % 2 === 0 ? "bg-slate-50" : "bg-white"}`}
        >
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-end justify-between mb-10 gap-4">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
                  {category.name} — {t("New Arrivals", "नए प्रोडक्ट्स")}
                </h2>
                <p className="text-slate-500">
                  {t(
                    `Fresh additions to our ${category.name} collection.`,
                    `हमारे ${category.name} कलेक्शन में नए जुड़े प्रोडक्ट्स।`,
                  )}
                </p>
              </div>

              <Link
                to={`/category/${category.slug}`}
                className="hidden sm:block shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap"
              >
                {t("View All", "सभी देखें")} →
              </Link>
            </div>

            <ProductGrid products={products} />
          </div>
        </section>
      ))}
    </>
  );
}

export default CategoryNewArrivals;
