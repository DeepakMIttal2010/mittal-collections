import { useEffect, useState } from "react";

import { getHotelCollectionProducts } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";

function HotelCollectionPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const response = await getHotelCollectionProducts(50);

      if (response.success) setProducts(response.products);

      setLoading(false);
    };

    load();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Seo
        title="Hotel-Style Bedsheets"
        description="Plain, solid-colour hotel-style bedsheets at Mittal Collections — the same simple, easy-care look used in hotel rooms across Vasundhara, Ghaziabad and nearby areas. Free delivery within 24 hours."
        url="https://www.mittalcollections.com/hotel-collection"
      />
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        Hotel-Style Bedsheets
      </h1>
      <p className="text-slate-500 mb-8">
        Plain, solid-colour bedsheets with that clean, no-fuss hotel look —
        easy to maintain, easy to match with any room.
      </p>

      {loading ? (
        <ProductGridSkeleton />
      ) : products.length === 0 ? (
        <p className="text-slate-500">No hotel-collection products yet.</p>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}

export default HotelCollectionPage;
