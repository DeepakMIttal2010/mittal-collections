import { useEffect, useState } from "react";

import { getProducts } from "../../services/productService";
import ProductGrid from "../ProductGrid/ProductGrid";
import ProductGridSkeleton from "../ProductGrid/ProductGridSkeleton";

const ARRIVALS_COUNT = 8;

function NewArrivals() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts().then((response) => {
      if (response.success) {
        setProducts(response.products.slice(0, ARRIVALS_COUNT));
      }

      setLoading(false);
    });
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-2">
          New Arrivals
        </h2>
        <p className="text-slate-500 text-center mb-10">
          Fresh additions to our collection, just for you.
        </p>

        {loading ? (
          <ProductGridSkeleton />
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </section>
  );
}

export default NewArrivals;
