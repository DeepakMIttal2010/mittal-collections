import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa6";

import { getGiftingProductsByCategory } from "../services/productService";
import { getSiteSettings } from "../services/settingsService";
import { toWhatsAppNumber } from "../utils/whatsapp";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import { useLanguage } from "../context/LanguageContext";
import { SITE_URL } from "../utils/siteUrl";

const BREADCRUMB_ITEMS = [{ name: "Home", path: "/" }, { name: "Gifting" }];

// Grouped by category, same shape as NewArrivalsPage — each category's
// section shows PAGE_SIZE products by default; "Show More" reveals
// another PAGE_SIZE at a time from what's already been fetched. Unlike
// New Arrivals, a category's gifting section isn't separately
// admin-curated — it exists automatically whenever that category has
// >=1 product opted into gifting (see getGiftingProductsByCategory).
const PAGE_SIZE = 8;
const FETCH_LIMIT = 40;

function GiftingPage() {
  const [sections, setSections] = useState([]);
  const [visibleCounts, setVisibleCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    getGiftingProductsByCategory(FETCH_LIMIT).then((response) => {
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

    getSiteSettings().then((response) => {
      if (response.success && response.settings.phone) {
        setPhone(response.settings.phone);
      }
    });
  }, []);

  const showMore = (categoryId, total) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [categoryId]: Math.min((prev[categoryId] || PAGE_SIZE) + PAGE_SIZE, total),
    }));
  };

  // A separate, gifting-specific WhatsApp message (not the generic
  // floating WhatsAppButton every page already has) — bulk/corporate
  // gifting orders are exactly the kind of thing that needs a human
  // conversation rather than the normal add-to-cart flow.
  const bulkWaLink = phone
    ? `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(
        "Hi, I'd like to enquire about a bulk/corporate gifting order from Mittal Collections.",
      )}`
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Seo
        title="Gifting — Home Furnishing Gift Ideas"
        description="Ready-to-gift home furnishing picks at Mittal Collections, organised by category — housewarmings, weddings and festive occasions, no separate wrapping needed."
        url={`${SITE_URL}/gifting`}
        jsonLd={buildBreadcrumbJsonLd(BREADCRUMB_ITEMS)}
      />

      <Breadcrumbs
        items={[
          { name: t("Home", "होम"), path: "/" },
          { name: t("Gifting", "गिफ्टिंग") },
        ]}
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        🎁 {t("Gifting", "गिफ्टिंग")}
      </h1>
      <p className="text-slate-500 mb-6">
        {t(
          "Ready-to-gift picks for housewarmings, weddings and festive occasions, organised by category.",
          "हाउसवार्मिंग, शादी और त्योहारों के लिए तैयार गिफ्ट पसंद, कैटेगरी के अनुसार।",
        )}
      </p>

      {bulkWaLink && (
        <a
          href={bulkWaLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mb-10 p-4 rounded-xl bg-[#e9fbef] border border-[#25D366]/30 hover:bg-[#dcf8e6] transition-colors"
        >
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#25D366] text-white shrink-0">
            <FaWhatsapp className="text-lg" />
          </span>
          <span className="text-sm text-slate-700">
            <span className="font-semibold">
              {t("Want it in bulk?", "बल्क में चाहिए?")}
            </span>{" "}
            {t(
              "For bulk or corporate gifting orders, contact us on WhatsApp.",
              "बल्क या कॉर्पोरेट गिफ्टिंग ऑर्डर के लिए, हमें WhatsApp पर संपर्क करें।",
            )}
          </span>
        </a>
      )}

      {loading ? (
        <ProductGridSkeleton />
      ) : sections.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {t(
            "No gifting picks right now — check back soon!",
            "अभी कोई गिफ्टिंग आइटम नहीं है — जल्द ही वापस देखें!",
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

export default GiftingPage;
