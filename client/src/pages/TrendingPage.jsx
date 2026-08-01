import { useEffect, useState } from "react";

import { getTrendingProducts } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";

function TrendingPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTrending = async () => {
      setLoading(true);

      const response = await getTrendingProducts(50);

      if (response.success) setProducts(response.products);

      setLoading(false);
    };

    loadTrending();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Seo
        title="Top Trending"
        description="Handpicked by our team - the home furnishing pieces everyone's loving right now at Mittal Collections."
      />
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        Top Trending
      </h1>
      <p className="text-slate-500 mb-8">
        Handpicked by our team — the pieces everyone&apos;s loving right now.
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}

export default TrendingPage;
