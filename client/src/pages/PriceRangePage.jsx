import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getProductsByMaxPrice } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";

function PriceRangePage() {
  const { maxPrice } = useParams();

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
      <Seo
        title={`Products Under ₹${maxPrice}`}
        description={`Shop home furnishing products under ₹${maxPrice} at Mittal Collections - bedsheets, towels, curtains and more.`}
      />
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Products Under ₹{maxPrice}
      </h1>
      <p className="text-slate-500 mb-8">
        {loading
          ? "Loading products..."
          : `${products.length} product${products.length !== 1 ? "s" : ""} found`}
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
