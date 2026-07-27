import { Link } from "react-router-dom";
import { FaTrash, FaShoppingCart } from "react-icons/fa";

import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";

import "./Wishlist.css";

function Wishlist() {
  const { wishlistItems, removeFromWishlist, clearWishlist } = useWishlist();

  const { addToCart } = useCart();

  if (!wishlistItems || wishlistItems.length === 0) {
    return (
      <div className="empty-wishlist">
        <h2>Your Wishlist is Empty ❤️</h2>

        <p>Save your favourite products here.</p>

        <Link to="/" className="shop-btn">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <section className="wishlist-page">
      <div className="container">
        <h2 className="wishlist-title">My Wishlist</h2>

        <div className="wishlist-grid">
          {wishlistItems.map((item) => (
            <div className="wishlist-card" key={item._id}>
              <img src={`http://localhost:5000${item.image}`} alt={item.name} />

              <h3>{item.name}</h3>

              <p>{item.category?.name || item.category}</p>

              <h4>₹{item.price}</h4>

              <div className="wishlist-buttons">
                <button
                  className="cart-btn"
                  onClick={() => {
                    addToCart(item);
                    removeFromWishlist(item._id);
                  }}
                >
                  <FaShoppingCart />
                  Add To Cart
                </button>

                <button
                  className="remove-btn"
                  onClick={() => removeFromWishlist(item._id)}
                >
                  <FaTrash />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {wishlistItems.length > 0 && (
          <div className="wishlist-footer">
            <button className="clear-btn" onClick={clearWishlist}>
              Clear Wishlist
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default Wishlist;
