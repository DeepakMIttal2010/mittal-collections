import { useState } from "react";
import products from "../../data/products";
import ProductGrid from "../ProductGrid/ProductGrid";
import "./ProductSection.css";

function ProductSection() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("featured");

  const categories = [
    "All",
    "Bedsheets",
    "Curtains",
    "Towels",
    "Cushions",
    "Blankets",
    "Pillows",
  ];

  let filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === "All" || product.category === selectedCategory;

    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // Sorting
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
      filteredProducts.sort((a, b) => a.id - b.id);
  }

  return (
    <section className="product-section">
      <div className="container">
        <h2 className="section-title">Our Products</h2>

        {/* Search */}

        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Category */}

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

        {/* Sort */}

        <div className="sort-box">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="featured">Featured</option>

            <option value="priceLow">Price : Low → High</option>

            <option value="priceHigh">Price : High → Low</option>

            <option value="rating">Rating</option>

            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        <ProductGrid products={filteredProducts} />
      </div>
    </section>
  );
}

export default ProductSection;
