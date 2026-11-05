import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { getNewArrivalsByCategory } from "../../services/productService";
import ProductGrid from "../ProductGrid/ProductGrid";
import ProductGridSkeleton from "../ProductGrid/ProductGridSkeleton";
import Skeleton from "../Skeleton";
import { useLanguage } from "../../context/LanguageContext";
import { langPrefix } from "../../utils/hindiPath";

// Homepage teaser: the first HOME_SECTIONS categories in admin order (see
// /admin/new-arrivals), HOME_ARRIVALS_COUNT newest each. Every category,
// 8 + Show More each, stays on the /new-arrivals page.
const HOME_SECTIONS = 3;
const HOME_ARRIVALS_COUNT = 4;

// One "New Arrivals" section per admin-opted-in category (see Category's
// showInHomeNewArrivals, managed from /admin/new-arrivals) — replaces the
// old single site-wide section so each category gets its own newest-items
// showcase instead of one mixed feed.
function CategoryNewArrivals() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();
  const prefix = langPrefix(useLocation().pathname);

  useEffect(() => {
    getNewArrivalsByCategory(HOME_ARRIVALS_COUNT).then((response) => {
      if (response.success) {
        setSections(response.sections.slice(0, HOME_SECTIONS));
      }

      setLoading(false);
    });
  }, []);

  // Same shape as the loaded sections (heading + one 4-card grid each) so
  // the content below doesn't move when the data arrives.
  if (loading) {
    return (
      <>
        {Array.from({ length: HOME_SECTIONS }).map((_, index) => (
          <section
            key={index}
            className={`py-16 ${index % 2 === 0 ? "bg-slate-50" : "bg-white"}`}
          >
            <div className="max-w-7xl mx-auto px-4">
              <div className="mb-10">
                <Skeleton className="h-9 md:h-10 w-2/3 md:w-1/2 mb-2" />
                <Skeleton className="h-6 w-1/2 md:w-1/3" />
              </div>
              <ProductGridSkeleton count={HOME_ARRIVALS_COUNT} />
              {index === HOME_SECTIONS - 1 && <div className="mt-10 h-11" />}
            </div>
          </section>
        ))}
      </>
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
                  {t(category.name, category.nameHi)} —{" "}
                  {t("New Arrivals", "नए प्रोडक्ट्स")}
                </h2>
                <p className="text-slate-500">
                  {t(
                    `Fresh additions to our ${category.name} collection.`,
                    `हमारे ${t(category.name, category.nameHi)} कलेक्शन में नए जुड़े प्रोडक्ट्स।`,
                  )}
                </p>
              </div>

              <Link
                to={`${prefix}/category/${category.slug}`}
                className="shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap"
              >
                {t("View All", "सभी देखें")} →
              </Link>
            </div>

            {/* below the fold on the homepage -- never compete with the hero */}
            <ProductGrid products={products} priorityCount={0} />

            {index === sections.length - 1 && (
              <div className="flex justify-center mt-10">
                <Link
                  to={`${prefix}/new-arrivals`}
                  className="border-2 border-blue-700 text-blue-700 hover:bg-blue-50 font-semibold px-8 py-2.5 rounded-full transition-colors"
                >
                  {t("View All New Arrivals", "सभी नए प्रोडक्ट्स देखें")} →
                </Link>
              </div>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

export default CategoryNewArrivals;
