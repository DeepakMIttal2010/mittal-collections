import { useParams, Link } from "react-router-dom";
import products from "../data/products";
import { FaStar, FaShoppingCart, FaHeart } from "react-icons/fa";
import "./ProductDetails.css";

function ProductDetails() {
  const { id } = useParams();

  const product = products.find((item) => item.id === Number(id));

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
        {/* Left */}

        <div className="details-image">
          <img src={product.image} alt={product.name} />
        </div>

        {/* Right */}

        <div className="details-content">
          <p className="details-category">{product.category}</p>

          <h1>{product.name}</h1>

          <div className="details-rating">
            <FaStar className="star" />
            {product.rating}
          </div>

          <div className="details-price">
            <span className="price">₹{product.price}</span>

            <span className="old-price">₹{product.oldPrice}</span>
          </div>

          <p className="stock">In Stock : {product.stock}</p>

          <p className="description">
            Experience premium quality with our carefully crafted home
            furnishing collection. Designed for comfort, elegance and
            durability.
          </p>

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
