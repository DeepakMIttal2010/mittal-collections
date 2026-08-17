import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { searchProducts } from "../services/productService";
import { getCategories } from "../services/categoryService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";

function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const [products, setProducts] = useState([]);
  const [loadedQuery, setLoadedQuery] = useState(null);
  const [categories, setCategories] = useState([]);

  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  useEffect(() => {
    getCategories().then((res) => {
      if (res.success) setCategories(res.categories);
    });
  }, []);

  useEffect(() => {
    // Reset filters when the search term itself changes
    setCategory("");
    setSortBy("");
    setMinPrice("");
    setMaxPrice("");
  }, [query]);

  useEffect(() => {
    if (!query.trim()) return;

    let cancelled = false;
    setLoadedQuery(null);

    searchProducts(query, { category, sortBy, minPrice, maxPrice }).then(
      (data) => {
        if (cancelled) return;
        setProducts(data.products);
        setLoadedQuery(query);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [query, category, sortBy, minPrice, maxPrice]);

  const hasQuery = Boolean(query.trim());
  const loading = hasQuery && loadedQuery === null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* noindex, not just a canonical — there's no single canonical URL
          for arbitrary search queries, and robots.txt disallowing /search
          only blocks crawling, not indexing a URL Google discovers via an
          external link. This was showing up as "Duplicate without
          user-selected canonical" in Search Console. */}
      <Seo
        title={hasQuery ? `Search results for "${query}"` : "Search"}
        description={
          hasQuery
            ? `Search results for "${query}" at Mittal Collections.`
            : "Search Mittal Collections for bedsheets, towels, curtains and more."
        }
        noindex
      />

      <h2 className="text-xl font-semibold text-slate-800 mb-6">
        {hasQuery ? `Search results for "${query}"` : "Search"}
      </h2>

      {!hasQuery ? (
        <p className="text-slate-500">Type something in the search box above.</p>
      ) : loading ? (
        <ProductGridSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-slate-200">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min ₹"
              className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700"
            />
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max ₹"
              className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700"
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 ml-auto"
            >
              <option value="">Sort: Relevance</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest First</option>
            </select>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 mb-2">
                No products found for &quot;{query}&quot;.
              </p>
              <p className="text-slate-500 text-sm mb-8">
                Try a different search term, or browse a category below.
              </p>

              {categories.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  {categories.map((c) => (
                    <Link
                      key={c._id}
                      to={`/category/${c.slug}`}
                      className="px-4 py-2 rounded-full border border-slate-300 text-sm text-slate-700 hover:border-amber-500 hover:text-amber-600 transition-colors"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ProductGrid products={products} />
          )}
        </>
      )}
    </div>
  );
}

export default SearchResults;
