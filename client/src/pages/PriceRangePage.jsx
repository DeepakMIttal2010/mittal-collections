import { useParams } from "react-router-dom";

import { getProductsByMaxPrice } from "../services/productService";
import VirtualizedProductGrid from "../components/ProductGrid/VirtualizedProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";
import { useInfiniteProducts } from "../hooks/useInfiniteProducts";

function PriceRangePage() {
  const { maxPrice } = useParams();
  const { t } = useLanguage();

  const { products, loading, loadingMore, hasMore, totalCount, loadMore } =
    useInfiniteProducts(
      (page) => getProductsByMaxPrice(maxPrice, { page }),
      [maxPrice],
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* noindex — these faceted price pages overlap heavily in content
          across ranges (a product under ₹500 is also under ₹1000, etc.),
          which Search Console was flagging as "Duplicate without
          user-selected canonical" despite each self-canonicalizing.
          Already excluded from the sitemap for the same reason; still
          internally linked from PriceShowcase, so leaving them crawlable
          -but-unlisted was a halfway state, not an intentional one. */}
      <Seo
        title={`Products Under ₹${maxPrice}`}
        description={`Shop home furnishing products under ₹${maxPrice} at Mittal Collections - bedsheets, towels, curtains and more.`}
        url={`https://www.mittalcollections.com/price/${maxPrice}`}
        noindex
      />
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        {t(`Products Under ₹${maxPrice}`, `₹${maxPrice} से कम में प्रोडक्ट`)}
      </h1>
      <p className="text-slate-500 mb-8">
        {loading
          ? t("Loading products...", "प्रोडक्ट लोड हो रहे हैं...")
          : t(
              `${totalCount} product${totalCount !== 1 ? "s" : ""} found`,
              `${totalCount} प्रोडक्ट मिले`,
            )}
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : (
        <VirtualizedProductGrid
          products={products}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />
      )}
    </div>
  );
}

export default PriceRangePage;
