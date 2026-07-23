import "./Header.css";
import { FaUser, FaHeart, FaShoppingCart } from "react-icons/fa";

function Header() {
  return (
    <header className="header">
      <div className="container header-container">
        {/* Logo */}
        <div className="logo">
          <h2>MITTAL COLLECTIONS</h2>
        </div>

        {/* Search */}
        <div className="search-box">
          <input
            type="text"
            placeholder="Search Bedsheets, Towels, Curtains..."
          />
        </div>

        {/* Right Icons */}
        <div className="header-icons">
          <div className="icon-item">
            <FaUser />
            <span>Account</span>
          </div>

          <div className="icon-item">
            <FaHeart />
            <span>Wishlist</span>
          </div>

          <div className="icon-item">
            <FaShoppingCart />
            <span>Cart</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
