import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getProductsByMaxPrice } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

function PriceRangePage() {
  const { maxPrice } = useParams();
  const { t } = useLanguage();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const response = await getProductsByMaxPrice(maxPrice);

      if (response.success) setProducts(response.products);

      setLoading(false);
    };

    load();
  }, [maxPrice]);

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
              `${products.length} product${products.length !== 1 ? "s" : ""} found`,
              `${products.length} प्रोडक्ट मिले`,
            )}
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}

export default PriceRangePage;
