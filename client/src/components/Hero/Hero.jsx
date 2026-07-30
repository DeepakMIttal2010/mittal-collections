import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

import "./Hero.css";
import heroBanner from "../../assets/images/hero-banner.jpg";
import { getBanners } from "../../services/bannerService";

const AUTO_ROTATE_MS = 6000;

const FALLBACK_SLIDE = {
  _id: "fallback",
  image: null,
  subtitle: "PREMIUM HOME FURNISHING",
  title: "Transform Every Corner\nof Your Home",
  description:
    "Discover premium bedsheets, towels, curtains, pillows and blankets crafted for comfort, elegance and everyday luxury.",
  button1Label: "Shop Now",
  button1Link: "/category/bedsheets",
  button2Label: "Explore Collection",
  button2Link: "#shop-categories",
};

function HeroButton({ label, link, variant }) {
  if (!label) return null;

  const className = variant === "primary" ? "shop-btn" : "explore-btn";

  if (link.startsWith("#")) {
    return (
      <a href={link} className={className}>
        {label}
      </a>
    );
  }

  if (link.startsWith("http")) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link to={link || "/"} className={className}>
      {label}
    </Link>
  );
}

function Hero() {
  const [slides, setSlides] = useState([FALLBACK_SLIDE]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const loadBanners = async () => {
      const response = await getBanners();

      if (response.success && response.banners.length > 0) {
        setSlides(response.banners);
      }
    };

    loadBanners();
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, AUTO_ROTATE_MS);

    return () => clearInterval(interval);
  }, [slides.length]);

  const slide = slides[activeIndex];
  const backgroundImage = slide.image
    ? `http://localhost:5000${slide.image}`
    : heroBanner;

  const goPrev = () =>
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);

  const goNext = () => setActiveIndex((prev) => (prev + 1) % slides.length);

  return (
    <section className="hero" style={{ backgroundImage: `url(${backgroundImage})` }}>
      <div className="hero-overlay">
        <div className="container">
          <div className="hero-content">
            {slide.subtitle && (
              <span className="hero-subtitle">{slide.subtitle}</span>
            )}

            <h1>
              {slide.title.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < slide.title.split("\n").length - 1 && <br />}
                </span>
              ))}
            </h1>

            {slide.description && <p>{slide.description}</p>}

            <div className="hero-buttons">
              <HeroButton
                label={slide.button1Label}
                link={slide.button1Link}
                variant="primary"
              />
              <HeroButton
                label={slide.button2Label}
                link={slide.button2Link}
                variant="secondary"
              />
            </div>
          </div>
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="hero-arrow hero-arrow-left"
            >
              <FaChevronLeft />
            </button>

            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="hero-arrow hero-arrow-right"
            >
              <FaChevronRight />
            </button>

            <div className="hero-dots">
              {slides.map((s, i) => (
                <button
                  key={s._id}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => setActiveIndex(i)}
                  className={`hero-dot ${i === activeIndex ? "active" : ""}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default Hero;
