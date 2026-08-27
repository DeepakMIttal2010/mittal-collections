import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { searchProducts } from "../services/productService";
import { getCategories } from "../services/categoryService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

function SearchResults() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const categoryFromUrl = searchParams.get("category") || "";

  const [products, setProducts] = useState([]);
  const [loadedQuery, setLoadedQuery] = useState(null);
  const [categories, setCategories] = useState([]);

  // Filters are keyed to the query they belong to and reset synchronously
  // during render (not via a useEffect) whenever the query changes. Doing
  // this in an effect would fire one extra render/fetch with the new query
  // still paired to the previous query's category — a stray API call
  // (e.g. "blue" search still filtered by a leftover "Bedsheets" pick)
  // that flashes wrong/empty results before self-correcting a moment later.
  const [filters, setFilters] = useState(() => ({
    forQuery: query,
    category: categoryFromUrl,
    sortBy: "",
    minPrice: "",
    maxPrice: "",
  }));

  if (filters.forQuery !== query) {
    setFilters({
      forQuery: query,
      category: categoryFromUrl,
      sortBy: "",
      minPrice: "",
      maxPrice: "",
    });
  }

  const { category, sortBy, minPrice, maxPrice } = filters;
  const setCategory = (value) =>
    setFilters((f) => ({ ...f, category: value }));
  const setSortBy = (value) => setFilters((f) => ({ ...f, sortBy: value }));
  const setMinPrice = (value) =>
    setFilters((f) => ({ ...f, minPrice: value }));
  const setMaxPrice = (value) =>
    setFilters((f) => ({ ...f, maxPrice: value }));

  useEffect(() => {
    getCategories().then((res) => {
      if (res.success) {
        setCategories(
          [...res.categories].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    });
  }, []);

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
        {hasQuery
          ? t(`Search results for "${query}"`, `"${query}" के लिए खोज परिणाम`)
          : t("Search", "खोजें")}
      </h2>

      {!hasQuery ? (
        <p className="text-slate-500">{t("Type something in the search box above.", "ऊपर सर्च बॉक्स में कुछ टाइप करें।")}</p>
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
              <option value="">{t("All Categories", "सभी श्रेणियां")}</option>
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
              placeholder={t("Min ₹", "न्यूनतम ₹")}
              className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700"
            />
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder={t("Max ₹", "अधिकतम ₹")}
              className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700"
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 ml-auto"
            >
              <option value="">{t("Sort: Relevance", "क्रमबद्ध करें: प्रासंगिकता")}</option>
              <option value="price_asc">{t("Price: Low to High", "कीमत: कम से ज़्यादा")}</option>
              <option value="price_desc">{t("Price: High to Low", "कीमत: ज़्यादा से कम")}</option>
              <option value="newest">{t("Newest First", "सबसे नए पहले")}</option>
            </select>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 mb-2">
                {t(`No products found for "${query}".`, `"${query}" के लिए कोई प्रोडक्ट नहीं मिला।`)}
              </p>
              <p className="text-slate-500 text-sm mb-8">
                {t("Try a different search term, or browse a category below.", "कोई अलग सर्च टर्म आज़माएं, या नीचे किसी श्रेणी में देखें।")}
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
