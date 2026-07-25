import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { FaStar, FaShoppingCart, FaHeart } from "react-icons/fa";
import { getProductById } from "../services/productService";
import "./ProductDetails.css";

function ProductDetails() {
  const { id } = useParams();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    try {
      const data = await getProductById(id);
      setProduct(data);
    } catch (error) {
      console.error("Error loading product:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="not-found">
        <h2>Loading...</h2>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="not-found">
        <h2>Product Not Found</h2>

        <Link to="/">Back to Home</Link>
      </div>
    );
  }

  return (
    <section className="product-details">
      <div className="container details-container">
        <div className="details-image">
          <img
            src={`http://localhost:5000${product.image}`}
            alt={product.name}
          />
        </div>

        <div className="details-content">
          <p className="details-category">{product.category?.name}</p>

          <h1>{product.name}</h1>

          <div className="details-rating">
            <FaStar className="star" />
            {product.rating}
          </div>

          <div className="details-price">
            <span className="price">₹{product.price}</span>

            {product.oldPrice > 0 && (
              <span className="old-price">₹{product.oldPrice}</span>
            )}
          </div>

          <p className="stock">In Stock : {product.stock}</p>

          <p className="description">{product.description}</p>

          <div className="details-buttons">
            <button className="cart-btn">
              <FaShoppingCart />
              Add To Cart
            </button>

            <button className="wishlist-btn">
              <FaHeart />
              Wishlist
            </button>
          </div>

          <Link to="/" className="back-home">
            ← Continue Shopping
          </Link>
        </div>
      </div>
    </section>
  );
}

export default ProductDetails;
