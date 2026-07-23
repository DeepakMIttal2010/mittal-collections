import "./Hero.css";
import heroBanner from "../../assets/images/hero-banner.jpg";

function Hero() {
  return (
    <section
      className="hero"
      style={{
        backgroundImage: `url(${heroBanner})`,
      }}
    >
      <div className="hero-overlay">
        <div className="container">
          <div className="hero-content">
            <span className="hero-subtitle">PREMIUM HOME FURNISHING</span>

            <h1>
              Transform Every Corner
              <br />
              of Your Home
            </h1>

            <p>
              Discover premium bedsheets, towels, curtains, pillows and blankets
              crafted for comfort, elegance and everyday luxury.
            </p>

            <div className="hero-buttons">
              <button className="shop-btn">Shop Now</button>

              <button className="explore-btn">Explore Collection</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
