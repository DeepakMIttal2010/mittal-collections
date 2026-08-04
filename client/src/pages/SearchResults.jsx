import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { searchProducts } from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";

function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const [products, setProducts] = useState([]);
  const [loadedQuery, setLoadedQuery] = useState(null);

  useEffect(() => {
    if (!query.trim()) return;

    let cancelled = false;

    searchProducts(query).then((data) => {
      if (cancelled) return;
      setProducts(data.products);
      setLoadedQuery(query);
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const hasQuery = Boolean(query.trim());
  const loading = hasQuery && loadedQuery !== query;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Seo
        title={hasQuery ? `Search results for "${query}"` : "Search"}
        description={
          hasQuery
            ? `Search results for "${query}" at Mittal Collections.`
            : "Search Mittal Collections for bedsheets, towels, curtains and more."
        }
      />

      <h2 className="text-xl font-semibold text-slate-800 mb-6">
        {hasQuery ? `Search results for "${query}"` : "Search"}
      </h2>

      {!hasQuery ? (
        <p className="text-slate-500">Type something in the search box above.</p>
      ) : loading ? (
        <ProductGridSkeleton />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}

export default SearchResults;
