import "./ProductCard.css";
import { FaHeart, FaEye, FaShoppingCart, FaStar } from "react-icons/fa";

function ProductCard({ product }) {
  const discount = Math.round(
    ((product.oldPrice - product.price) / product.oldPrice) * 100,
  );

  return (
    <div className="product-card">
      <div className="product-image">
        <img src={product.image} alt={product.name} />

        <span className="discount-badge">{discount}% OFF</span>

        <div className="product-icons">
          <button>
            <FaHeart />
          </button>

          <button>
            <FaEye />
          </button>
        </div>
      </div>

      <div className="product-info">
        <p className="category">{product.category}</p>

        <h3>{product.name}</h3>

        <div className="rating">
          <FaStar className="star" />
          {product.rating}
        </div>

        <div className="price">
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
