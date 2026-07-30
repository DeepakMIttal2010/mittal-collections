import { useState } from "react";
import "./ProductCard.css";
import { Link } from "react-router-dom";
import { FaHeart, FaEye, FaShoppingCart, FaStar } from "react-icons/fa";
import { useWishlist } from "../../context/WishlistContext";
import { useCart } from "../../context/CartContext";
import QuickViewModal from "./QuickViewModal";

function ProductCard({ product }) {
  const { addToCart } = useCart();
  const { addToWishlist } = useWishlist();
  const [showQuickView, setShowQuickView] = useState(false);
  const discount = Math.round(
    ((product.oldPrice - product.price) / product.oldPrice) * 100,
  );

  return (
    <div className="product-card">
      <Link to={`/product/${product._id}`} className="product-link">
        <div className="product-image">
          <img
            src={`http://localhost:5000${product.image}`}
            alt={product.name}
          />

          <span className="discount-badge">{discount}% OFF</span>

          <div className="product-icons">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                addToWishlist(product);
              }}
            >
              <FaHeart />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowQuickView(true);
              }}
            >
              <FaEye />
            </button>
          </div>
        </div>

        <div className="product-info">
          <p className="category">{product.category?.name}</p>

          <h3>{product.name}</h3>

          <div className="rating">
            <FaStar className="star" />
            <span>{product.rating}</span>
          </div>

          <div className="price">
            <span className="new-price">₹{product.price}</span>

            <span className="old-price">₹{product.oldPrice}</span>
          </div>
        </div>
      </Link>

      <div className="product-action">
        <button
          className="cart-btn"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            addToCart(product);
          }}
        >
          <FaShoppingCart />
          Add to Cart
        </button>
      </div>

      {showQuickView && (
        <QuickViewModal
          product={product}
          onClose={() => setShowQuickView(false)}
        />
      )}
    </div>
  );
}

export default ProductCard;
