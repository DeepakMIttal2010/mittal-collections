import "./ProductGrid.css";
import ProductCard from "../ProductCard/ProductCard";

function ProductGrid({ products }) {
  if (products.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <h3>No products found.</h3>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export default ProductGrid;
