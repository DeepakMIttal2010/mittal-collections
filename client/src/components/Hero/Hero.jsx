import { imgUrl } from "../../services/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

import "./Hero.css";
import heroBanner from "../../assets/images/hero-banner.jpg";
import { getBanners } from "../../services/bannerService";
import { useLanguage } from "../../context/LanguageContext";

const AUTO_ROTATE_MS = 6000;

const FALLBACK_SLIDE = {
  _id: "fallback",
  image: null,
  subtitle: "PREMIUM HOME FURNISHING",
  subtitleHi: "प्रीमियम होम फर्निशिंग",
  title: "Transform Every Corner\nof Your Home",
  titleHi: "अपने घर के हर कोने को\nसंवारें",
  description:
    "Discover premium bedsheets, towels, curtains, pillows and blankets crafted for comfort, elegance and everyday luxury.",
  descriptionHi:
    "आराम, सुंदरता और रोज़मर्रा की लक्ज़री के लिए बनाए गए प्रीमियम बेडशीट, तौलिए, पर्दे, तकिए और कंबल देखें।",
  button1Label: "Shop Now",
  button1LabelHi: "अभी खरीदें",
  button1Link: "/category/bedsheets",
  button2Label: "Explore Collection",
  button2LabelHi: "कलेक्शन देखें",
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
  const { t } = useLanguage();

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
    ? `${imgUrl(slide.image)}`
    : heroBanner;
  const slideTitle = t(slide.title, slide.titleHi);
  const imageAlt = slide.title
    ? slideTitle.replace(/\n/g, " ")
    : t("Mittal Collections home furnishing", "मित्तल कलेक्शंस होम फर्निशिंग");

  const goPrev = () =>
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);

  const goNext = () => setActiveIndex((prev) => (prev + 1) % slides.length);

  return (
    <>
      <div className="hero-value-strip">
        {t(
          "Mittal Collections — Quality Home Furnishing at Great Prices",
          "मित्तल कलेक्शन्स — बेहतरीन कीमतों पर क्वालिटी होम फर्निशिंग",
        )}
      </div>

      <section className="hero">
      <img src={backgroundImage} alt={imageAlt} className="hero-bg-image" />
      <div className="hero-overlay">
        <div className="container">
          <div className="hero-content">
            {slide.subtitle && (
              <span className="hero-subtitle">
                {t(slide.subtitle, slide.subtitleHi)}
              </span>
            )}

            <h1>
              {slideTitle.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < slideTitle.split("\n").length - 1 && <br />}
                </span>
              ))}
            </h1>

            {slide.description && (
              <p>{t(slide.description, slide.descriptionHi)}</p>
            )}

            <div className="hero-buttons">
              <HeroButton
                label={t(slide.button1Label, slide.button1LabelHi)}
                link={slide.button1Link}
                variant="primary"
              />
              <HeroButton
                label={t(slide.button2Label, slide.button2LabelHi)}
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
              aria-label={t("Previous slide", "पिछली स्लाइड")}
              className="hero-arrow hero-arrow-left"
            >
              <FaChevronLeft />
            </button>

            <button
              type="button"
              onClick={goNext}
              aria-label={t("Next slide", "अगली स्लाइड")}
              className="hero-arrow hero-arrow-right"
            >
              <FaChevronRight />
            </button>

            <div className="hero-dots">
              {slides.map((s, i) => (
                <button
                  key={s._id}
                  type="button"
                  aria-label={t(`Go to slide ${i + 1}`, `स्लाइड ${i + 1} पर जाएं`)}
                  onClick={() => setActiveIndex(i)}
                  className={`hero-dot ${i === activeIndex ? "active" : ""}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      </section>
    </>
  );
}

export default Hero;
