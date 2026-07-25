import { useEffect, useState } from "react";
import { getProducts } from "../../services/productService";
import "./FeaturedProducts.css";
import ProductCard from "./ProductCard";

function FeaturedProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeaturedProducts();
  }, []);

  const loadFeaturedProducts = async () => {
    try {
      const data = await getProducts();

      const featuredProducts = data.filter(
        (product) => product.featured === true,
      );

      setProducts(featuredProducts);
    } catch (error) {
      console.error("Error loading featured products:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="featured-products">
        <div className="container">
          <h2>Featured Products</h2>
          <p>Loading...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="featured-products">
      <div className="container">
        <div className="section-header">
          <h2>Featured Products</h2>
          <p>Discover our best-selling premium home furnishing collection.</p>
        </div>

        <div className="products-grid">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturedProducts;
