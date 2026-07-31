import { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { getProducts } from "../../services/productService";
import { getCategories } from "../../services/categoryService";
import ProductGrid from "../ProductGrid/ProductGrid";

function ProductSection() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(["All"]);

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [productsResponse, categoriesResponse] = await Promise.all([
        getProducts(),
        getCategories(),
      ]);

      if (productsResponse.success) {
        setProducts(productsResponse.products);
      } else {
        setProducts([]);
      }

      if (categoriesResponse.success) {
        setCategories([
          "All",
          ...categoriesResponse.categories.map((category) => category.name),
        ]);
      } else {
        setCategories(["All"]);
      }
    } catch (error) {
      console.error("Error loading products:", error);

      setProducts([]);
      setCategories(["All"]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  let filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === "All" || product.category?.name === selectedCategory;

    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  switch (sortBy) {
    case "priceLow":
      filteredProducts.sort((a, b) => a.price - b.price);
      break;

    case "priceHigh":
      filteredProducts.sort((a, b) => b.price - a.price);
      break;

    case "rating":
      filteredProducts.sort((a, b) => b.rating - a.rating);
      break;

    case "name":
      filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
      break;

    default:
      break;
  }

  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-8">
          Our Products
        </h2>

        <div className="max-w-xl mx-auto mb-6 relative">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-slate-200 bg-white rounded-lg px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="featured">Featured</option>
            <option value="priceLow">Price : Low → High</option>
            <option value="priceHigh">Price : High → Low</option>
            <option value="rating">Rating</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-10">
            Loading products...
          </p>
        ) : (
          <ProductGrid products={filteredProducts} />
        )}
      </div>
    </section>
  );
}

export default ProductSection;
