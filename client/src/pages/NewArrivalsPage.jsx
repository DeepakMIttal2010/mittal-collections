import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { getNewArrivalsByCategory } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import { useLanguage } from "../context/LanguageContext";
import { SITE_URL } from "../utils/siteUrl";
import { isHindiPath } from "../utils/hindiPath";

const BREADCRUMB_ITEMS = [{ name: "Home", path: "/" }, { name: "New Arrivals" }];
const BREADCRUMB_ITEMS_HI = [{ name: "होम", path: "/hi" }, { name: "नए प्रोडक्ट्स" }];

// /new-arrivals and /hi/new-arrivals are one page in two languages -- same
// hreflang pair as /articles (see Articles.jsx and render.js).
const ALTERNATE_LANGS = [
  { lang: "en", url: `${SITE_URL}/new-arrivals` },
  { lang: "hi", url: `${SITE_URL}/hi/new-arrivals` },
  { lang: "x-default", url: `${SITE_URL}/new-arrivals` },
];

// Each category's section shows PAGE_SIZE products by default; "Show
// More" reveals another PAGE_SIZE at a time from what's already been
// fetched. Fetching FETCH_LIMIT (well above what a "Show More" click or
// two would ever reveal) upfront means every "Show More" click is
// instant — no extra request — while still capping how much any one
// category's newest-products query has to return.
const PAGE_SIZE = 8;
const FETCH_LIMIT = 40;

function NewArrivalsPage() {
  const [sections, setSections] = useState([]);
  const [visibleCounts, setVisibleCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const { t, language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const isHindi = isHindiPath(location.pathname);
  const prefix = isHindi ? "/hi" : "";

  // The URL decides the language on first load (both directions); after
  // that the header's language toggle moves to the other URL -- same as
  // Articles.jsx.
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (!hasSyncedRef.current) {
      hasSyncedRef.current = true;
      if ((language === "hi") !== isHindi) setLanguage(isHindi ? "hi" : "en");
      return;
    }

    const wantHindi = language === "hi";
    if (wantHindi === isHindi) return;
    navigate(wantHindi ? "/hi/new-arrivals" : "/new-arrivals", { replace: true });
  }, [language, isHindi, setLanguage, navigate]);

  useEffect(() => {
    getNewArrivalsByCategory(FETCH_LIMIT).then((response) => {
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
        title={isHindi ? "नए प्रोडक्ट्स — होम फर्निशिंग" : "New Arrivals — Home Furnishing"}
        description={
          isHindi
            ? "Mittal Collections के सबसे नए होम फर्निशिंग प्रोडक्ट्स, कैटेगरी के अनुसार - बेडशीट, पर्दे, कम्फर्टर और भी बहुत कुछ।"
            : "The newest home furnishing pieces at Mittal Collections, organised by category - bedsheets, cushion covers, doormats and more."
        }
        url={`${SITE_URL}${prefix}/new-arrivals`}
        lang={isHindi ? "hi" : "en"}
        alternateLangs={ALTERNATE_LANGS}
        jsonLd={buildBreadcrumbJsonLd(isHindi ? BREADCRUMB_ITEMS_HI : BREADCRUMB_ITEMS)}
      />

      <Breadcrumbs
        items={[
          { name: t("Home", "होम"), path: prefix || "/" },
          { name: t("New Arrivals", "नए प्रोडक्ट्स") },
        ]}
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
          {sections.map(({ category, products }) => {
            const visibleCount = visibleCounts[category._id] || PAGE_SIZE;
            const visibleProducts = products.slice(0, visibleCount);
            const hasMore = products.length > visibleCount;

            return (
              <section key={category._id}>
                <div className="flex items-end justify-between mb-6 gap-4">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {t(category.name, category.nameHi)}
                  </h2>

                  <Link
                    to={`${prefix}/category/${category.slug}`}
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

export default NewArrivalsPage;
