import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getCategories } from "../services/categoryService";
import { getSubcategories } from "../services/subcategoryService";
import {
  getProductsByCategory,
  getProductsBySubcategory,
} from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "name-asc", label: "Alphabetically, A-Z" },
  { value: "name-desc", label: "Alphabetically, Z-A" },
  { value: "date-desc", label: "Date, new to old" },
  { value: "date-asc", label: "Date, old to new" },
];

function sortProducts(products, sortBy) {
  const sorted = [...products];

  switch (sortBy) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "date-asc":
      return sorted.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );
    case "date-desc":
      return sorted.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
    case "featured":
    default:
      return sorted.sort((a, b) => (b.featured === true) - (a.featured === true));
  }
}

function CategoryPage() {
  const { categorySlug, subcategorySlug } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading");
  const [category, setCategory] = useState(null);
  const [subcategoryList, setSubcategoryList] = useState([]);
  const [activeSubcategory, setActiveSubcategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [sortBy, setSortBy] = useState("featured");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const catRes = await getCategories();
      const matchedCategory = catRes.categories.find(
        (c) => c.slug === categorySlug,
      );

      if (!matchedCategory) {
        if (!cancelled) setStatus("not-found");
        return;
      }

      const subRes = await getSubcategories();
      const categorySubcategories = subRes.subcategories
        .filter((s) => s.category?._id === matchedCategory._id)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      const matchedSubcategory = subcategorySlug
        ? categorySubcategories.find((s) => s.slug === subcategorySlug)
        : null;

      const productsRes = matchedSubcategory
        ? await getProductsBySubcategory(matchedSubcategory._id)
        : await getProductsByCategory(matchedCategory._id);

      if (cancelled) return;
      setCategory(matchedCategory);
      setSubcategoryList(categorySubcategories);
      setActiveSubcategory(matchedSubcategory);
      setProducts(productsRes.products);
      setStatus("ready");
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [categorySlug, subcategorySlug]);

  const sortedProducts = useMemo(
    () => sortProducts(products, sortBy),
    [products, sortBy],
  );

  if (status === "loading") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <ProductGridSkeleton />
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Category not found
        </h2>
        <Link to="/" className="text-blue-700 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const pillClass = (isActive) =>
    `px-4 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors ${
      isActive
        ? "bg-amber-600 border-amber-600 text-white"
        : "border-slate-300 text-slate-700 hover:border-amber-600 hover:text-amber-600"
    }`;

  const pageTitle = activeSubcategory
    ? `${activeSubcategory.name} - ${category.name}`
    : category.name;

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: category.name, path: `/category/${categorySlug}` },
    ...(activeSubcategory ? [{ name: activeSubcategory.name }] : []),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Seo
        title={pageTitle}
        description={`Shop ${pageTitle} at Mittal Collections. ${category.description || ""}`.trim()}
        url={`https://www.mittalcollections.com/category/${categorySlug}${subcategorySlug ? `/${subcategorySlug}` : ""}`}
        jsonLd={breadcrumbJsonLd}
      />
      <h1 className="text-xl font-semibold text-slate-800 mb-4">
        {category.name}
        {activeSubcategory ? ` / ${activeSubcategory.name}` : ""}
      </h1>

      {subcategoryList.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            type="button"
            className={pillClass(!activeSubcategory)}
            onClick={() => navigate(`/category/${categorySlug}`)}
          >
            All
          </button>

          {subcategoryList.map((sub) => (
            <button
              key={sub._id}
              type="button"
              className={pillClass(activeSubcategory?._id === sub._id)}
              onClick={() =>
                navigate(`/category/${categorySlug}/${sub.slug}`)
              }
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mb-6">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-slate-300 rounded-lg text-sm text-slate-700 px-3 py-2 outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort by: {opt.label}
            </option>
          ))}
        </select>
      </div>

      <ProductGrid products={sortedProducts} />
    </div>
  );
}

export default CategoryPage;
