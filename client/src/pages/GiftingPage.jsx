import { useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa6";

import { getGiftingProducts } from "../services/productService";
import { getSiteSettings } from "../services/settingsService";
import { toWhatsAppNumber } from "../utils/whatsapp";
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
  const [phone, setPhone] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    getGiftingProducts(FETCH_LIMIT).then((response) => {
      if (response.success) {
        setProducts(response.products);
      }
      setLoading(false);
    });

    getSiteSettings().then((response) => {
      if (response.success && response.settings.phone) {
        setPhone(response.settings.phone);
      }
    });
  }, []);

  // A separate, gifting-specific WhatsApp message (not the generic
  // floating WhatsAppButton every page already has) — bulk/corporate
  // gifting orders are exactly the kind of thing that needs a human
  // conversation rather than the normal add-to-cart flow.
  const bulkWaLink = phone
    ? `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(
        "Hi, I'd like to enquire about a bulk/corporate gifting order from Mittal Collections.",
      )}`
    : null;

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
      <p className="text-slate-500 mb-6">
        {t(
          "Ready-to-gift picks for housewarmings, weddings and festive occasions.",
          "हाउसवार्मिंग, शादी और त्योहारों के लिए तैयार गिफ्ट पसंद।",
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
