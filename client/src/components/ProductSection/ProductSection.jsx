import { useState } from "react";
import products from "../../data/products";
import ProductGrid from "../ProductGrid/ProductGrid";
import "./ProductSection.css";

function ProductSection() {
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = [
    "All",
    "Bedsheets",
    "Curtains",
    "Towels",
    "Cushions",
    "Blankets",
    "Pillows",
  ];

  const filteredProducts =
    selectedCategory === "All"
      ? products
      : products.filter((product) => product.category === selectedCategory);

  return (
    <section className="product-section">
      <div className="container">
        <h2 className="section-title">Our Products</h2>

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

        <ProductGrid products={filteredProducts} />
      </div>
    </section>
  );
}

export default ProductSection;
