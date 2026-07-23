import "./OffersBanner.css";

function OffersBanner() {
  return (
    <section className="offers-banner">
      <div className="container">
        <span className="offer-tag">🎉 LIMITED TIME OFFER</span>

        <h2>Flat 30% OFF</h2>

        <h3>Premium Home Furnishing Collection</h3>

        <p>
          Discover elegant bedsheets, curtains, towels, pillows and blankets at
          exclusive prices.
        </p>

        <div className="offer-buttons">
          <button className="shop-btn">Shop Now</button>

          <button className="view-btn">View Offers</button>
        </div>
      </div>
    </section>
  );
}

export default OffersBanner;
