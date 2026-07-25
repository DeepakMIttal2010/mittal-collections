import "./Navbar.css";
import { NavLink } from "react-router-dom";
import { FaHeart, FaShoppingCart } from "react-icons/fa";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useAuth } from "../../context/AuthContext";

function Navbar() {
  const { totalItems } = useCart();
  const { totalWishlistItems } = useWishlist();
  const { user, logout, isLoggedIn } = useAuth();

  return (
    <nav className="navbar-custom">
      <div className="container navbar-container">
        {/* Left Menu */}

        <div className="nav-links">
          <NavLink to="/">Home</NavLink>

          <NavLink to="/bedsheets">Bedsheets</NavLink>

          <NavLink to="/towels">Towels</NavLink>

          <NavLink to="/curtains">Curtains</NavLink>

          <NavLink to="/pillows">Pillows</NavLink>

          <NavLink to="/blankets">Blankets</NavLink>

          <NavLink to="/offers">Offers</NavLink>

          <NavLink to="/about">About</NavLink>

          <NavLink to="/contact">Contact</NavLink>
        </div>

        {/* Right Icons */}

        <div className="nav-icons">
          {isLoggedIn ? (
            <>
              <span className="welcome-user">Hi, {user?.name}</span>

              <NavLink to="/wishlist" className="icon-box">
                <FaHeart />
                {totalWishlistItems > 0 && (
                  <span className="wishlist-count">{totalWishlistItems}</span>
                )}
              </NavLink>

              <NavLink to="/cart" className="icon-box cart-icon">
                <FaShoppingCart />
                {totalItems > 0 && (
                  <span className="cart-count">{totalItems}</span>
                )}
              </NavLink>

              <button className="logout-btn" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>

              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
