import { imgUrl, imgSrcSet } from "../../services/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

import "./Hero.css";
import heroBanner from "../../assets/images/hero-banner.webp";
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

  const slide = slides[Math.min(activeIndex, slides.length - 1)];
  // LCP element, but bounded to the .hero-split-image column (roughly
  // half the .container width, well under 1000px on any real viewport)
  // rather than the old full-bleed treatment — w_1000 covers that at
  // up to ~2x pixel density without fetching a full-viewport-wide image
  // for a half-width slot. q_auto,f_auto lets Cloudinary pick the
  // smallest format the browser actually supports (WebP/AVIF) at a
  // sensible quality, instead of serving whatever the admin originally
  // uploaded as-is.
  const backgroundImage = slide.image
    ? imgUrl(slide.image, "w_1000,q_auto,f_auto")
    : heroBanner;
  const slideTitle = t(slide.title, slide.titleHi);
  const imageAlt = slide.title
    ? slideTitle.replace(/\n/g, " ")
    : t("Mittal Collections home furnishing", "मित्तल कलेक्शंस होम फर्निशिंग");

  const goPrev = () =>
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);

  const goNext = () => setActiveIndex((prev) => (prev + 1) % slides.length);

  // Rendered inside .hero-split-media (the photo column) so the
  // arrows/dots anchor to the photo itself, not the whole section — the
  // text column's height varies per slide and no longer matches the
  // photo's, so anchoring to the outer section used to drift the arrows
  // over the title/description on shorter-text slides.
  const arrowsAndDots = slides.length > 1 && (
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

      <div className="hero-dots hero-dots-light">
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
  );

  // A bounded image column + a light content column, rather than a
  // full-bleed photo with dark-overlaid text — see Hero.css's
  // .hero-split-* rules. Every admin-uploaded photo just does a normal
  // object-fit: cover inside its own fixed-ratio box here, so (unlike the
  // old full-bleed treatment) no blur-backdrop trick is needed for photos
  // that aren't already wide/banner-shaped.
  return (
    <section className="hero">
      <div className="container hero-split">
        <div className="hero-split-media">
          <img
            src={backgroundImage}
            srcSet={slide.image ? imgSrcSet(slide.image, [500, 800, 1200]) : undefined}
            sizes="(max-width: 640px) 90vw, (max-width: 1200px) 45vw, 512px"
            alt={imageAlt}
            className="hero-split-image"
            fetchPriority="high"
            // Falls back to the bundled default banner (guaranteed to
            // exist, no network round-trip) rather than the generic
            // site-icon placeholder every other image uses — this is the
            // page's LCP element, so a visibly broken hero would be worse
            // than any other spot.
            onError={(e) => {
              e.target.onerror = null;
              e.target.srcset = "";
              e.target.src = heroBanner;
            }}
          />
          {arrowsAndDots}
        </div>

        <div className="hero-split-content">
          {slide.subtitle && (
            <div className="hero-split-eyebrow-row">
              <span className="hero-split-divider" aria-hidden="true" />
              <span className="hero-split-eyebrow">
                {t(slide.subtitle, slide.subtitleHi)}
              </span>
              <span className="hero-split-divider" aria-hidden="true" />
            </div>
          )}

          <h1 className="hero-split-title">
            {slideTitle.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i < slideTitle.split("\n").length - 1 && <br />}
              </span>
            ))}
          </h1>

          {slide.description && (
            <p className="hero-split-desc">{t(slide.description, slide.descriptionHi)}</p>
          )}

          <div className="hero-split-buttons">
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
    </section>
  );
}

export default Hero;
