import { useEffect, useState } from "react";
import { getProducts } from "../../services/productService";
import { getCategories } from "../../services/categoryService";
import ProductGrid from "../ProductGrid/ProductGrid";
import "./ProductSection.css";

function ProductSection() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(["All"]);

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

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
    <section className="product-section">
      <div className="container">
        <h2 className="section-title">Our Products</h2>

        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="category-filter">
          {categories.map((category) => (
            <button
              key={category}
              className={selectedCategory === category ? "active" : ""}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="sort-box">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="featured">Featured</option>
            <option value="priceLow">Price : Low → High</option>
            <option value="priceHigh">Price : High → Low</option>
            <option value="rating">Rating</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <h3>Loading products...</h3>
          </div>
        ) : (
          <ProductGrid products={filteredProducts} />
        )}
      </div>
    </section>
  );
}

export default ProductSection;
