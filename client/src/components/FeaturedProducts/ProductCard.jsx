import "./ProductCard.css";
import { FaHeart, FaShoppingCart, FaStar } from "react-icons/fa";

function ProductCard({ product }) {
  return (
    <div className="product-card">
      <div className="product-image">
        <img src={product.image} alt={product.name} />

        <button className="wishlist-btn">
          <FaHeart />
        </button>
      </div>

      <div className="product-details">
        <span className="product-category">{product.category}</span>

        <h3>{product.name}</h3>

        <div className="product-rating">
          <FaStar className="star" />
          <span>{product.rating}</span>
        </div>

        <div className="product-price">
          <span className="new-price">₹{product.price}</span>

          <span className="old-price">₹{product.oldPrice}</span>
        </div>

        <button className="cart-btn">
          <FaShoppingCart />
          Add to Cart
        </button>
      </div>
    </div>
  );
}

export default ProductCard;
