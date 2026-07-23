import "./TopBar.css";

function TopBar() {
  return (
    <div className="topbar">
      <div className="container d-flex justify-content-between align-items-center">
        <div className="left">🚚 FREE SHIPPING on orders above ₹999</div>

        <div className="center">
          <span>Premium Quality</span>
          <span>|</span>
          <span>Best Prices</span>
          <span>|</span>
          <span>Easy Returns</span>
        </div>

        <div className="right">
          <span>Track Order</span>
          <span>|</span>
          <span>Help & Support</span>
        </div>
      </div>
    </div>
  );
}

export default TopBar;
