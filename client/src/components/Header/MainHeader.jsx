import "./MainHeader.css";
import { FaSearch, FaHeart, FaShoppingBag, FaUser } from "react-icons/fa";

function MainHeader() {
  return (
    <div className="main-header">
      <div className="container">
        <div className="logo">
          <h2>Mittal Collections</h2>
          <small>HOME FURNISHING</small>
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder="Search bedsheets, towels, curtains..."
          />
          <button>
            <FaSearch />
          </button>
        </div>

        <div className="header-icons">
          <div className="icon-box">
            <FaUser />
            <span>Account</span>
          </div>

          <div className="icon-box">
            <FaHeart />
            <span>Wishlist</span>
          </div>

          <div className="icon-box">
            <FaShoppingBag />
            <span>Cart</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MainHeader;
