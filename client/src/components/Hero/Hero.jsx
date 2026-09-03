import { imgUrl } from "../../services/api";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FaChevronLeft,
  FaChevronRight,
  FaGift,
  FaCoins,
  FaUserFriends,
  FaPen,
  FaArrowRight,
} from "react-icons/fa";

import "./Hero.css";
import heroBanner from "../../assets/images/hero-banner.webp";
import { getBanners } from "../../services/bannerService";
import { getPublicRewardsInfo } from "../../services/rewardsService";
import { getBannerCoupon } from "../../services/couponService";
import { useAuth } from "../../context/AuthContext";
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

// Always-present first slide (not admin-configured) summarising the
// site's actual rewards program — built from the same public rewards +
// banner-coupon APIs the rest of the app uses, so it can't drift out of
// sync with what's really on offer. Rendered with its own icon-badge
// layout (see hero-rewards-content below) rather than the standard
// photo-slide template, and a plain gradient stands in for a photo.
function useRewardsSlide(t, isLoggedIn) {
  const [rewards, setRewards] = useState(null);
  const [coupon, setCoupon] = useState(null);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setRewards(response);
    });

    getBannerCoupon().then((response) => {
      if (response.success && response.coupon) setCoupon(response.coupon);
    });
  }, []);

  if (!rewards) return null;

  const couponLabel = coupon
    ? coupon.discountType === "flat"
      ? t(`₹${coupon.discountValue} OFF`, `₹${coupon.discountValue} की छूट`)
      : t(`${coupon.discountValue}% OFF`, `${coupon.discountValue}% की छूट`)
    : null;

  const benefits = [
    coupon && {
      icon: <FaGift />,
      theme: "rose",
      title: t("Welcome Offer", "वेलकम ऑफर"),
      text: t(
        `${couponLabel} on your first order${coupon.maxDiscount ? ` — up to ₹${coupon.maxDiscount}` : ""}. Use code ${coupon.code}.`,
        `आपके पहले ऑर्डर पर ${couponLabel}${coupon.maxDiscount ? ` — ₹${coupon.maxDiscount} तक` : ""}। कोड ${coupon.code} इस्तेमाल करें।`,
      ),
    },
    {
      icon: <FaCoins />,
      theme: "amber",
      title: t("Earn Loyalty Points", "लॉयल्टी पॉइंट्स कमाएं"),
      text: t(
        `Earn 1 point for every ₹${rewards.loyalty.earnRate} you spend, credited once your order is delivered.`,
        `हर ₹${rewards.loyalty.earnRate} खर्च पर 1 पॉइंट कमाएं, जो ऑर्डर डिलीवर होने पर मिलता है।`,
      ),
    },
    {
      icon: <FaUserFriends />,
      theme: "indigo",
      title: t("Refer & Earn", "रेफर करें और कमाएं"),
      text: t(
        `Invite a friend — you get ${rewards.referral.referrerPoints} points, they get ${rewards.referral.referredPoints} on their first order.`,
        `किसी दोस्त को बुलाएं — आपको ${rewards.referral.referrerPoints} पॉइंट्स मिलेंगे, उन्हें उनके पहले ऑर्डर पर ${rewards.referral.referredPoints} पॉइंट्स मिलेंगे।`,
      ),
    },
    {
      icon: <FaPen />,
      theme: "teal",
      title: t("Review & Earn", "रिव्यू करें और कमाएं"),
      text: t(
        `Bought something? Write a review and earn up to ${rewards.reviewBonusPoints} points on that order.`,
        `कुछ खरीदा है? रिव्यू लिखें और उस ऑर्डर पर ${rewards.reviewBonusPoints} तक पॉइंट्स कमाएं।`,
      ),
    },
  ].filter(Boolean);

  return {
    _id: "rewards",
    isRewardsSlide: true,
    subtitle: t("REWARDS PROGRAM", "रिवॉर्ड्स प्रोग्राम"),
    title: t("Earn While You Shop", "खरीदारी करें और कमाएं"),
    benefits,
    button1Label: isLoggedIn
      ? t("View My Rewards", "मेरे रिवॉर्ड देखें")
      : t("Start Earning", "कमाना शुरू करें"),
    button1Link: "/rewards",
  };
}

function Hero() {
  const [slides, setSlides] = useState([FALLBACK_SLIDE]);
  const [activeIndex, setActiveIndex] = useState(0);
  const { t } = useLanguage();
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const rewardsSlide = useRewardsSlide(t, isLoggedIn);

  useEffect(() => {
    const loadBanners = async () => {
      const response = await getBanners();

      if (response.success && response.banners.length > 0) {
        setSlides(response.banners);
      }
    };

    loadBanners();
  }, []);

  const allSlides = rewardsSlide ? [rewardsSlide, ...slides] : slides;

  useEffect(() => {
    if (allSlides.length <= 1) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % allSlides.length);
    }, AUTO_ROTATE_MS);

    return () => clearInterval(interval);
  }, [allSlides.length]);

  const slide = allSlides[Math.min(activeIndex, allSlides.length - 1)];
  // Full-bleed LCP element (.hero-bg-image covers the whole viewport
  // width) — q_auto,f_auto lets Cloudinary pick the smallest format the
  // browser actually supports (WebP/AVIF) at a sensible quality,
  // instead of serving whatever the admin originally uploaded as-is.
  const backgroundImage = slide.image
    ? imgUrl(slide.image, "w_1920,q_auto,f_auto")
    : heroBanner;
  const slideTitle = t(slide.title, slide.titleHi);
  const imageAlt = slide.title
    ? slideTitle.replace(/\n/g, " ")
    : t("Mittal Collections home furnishing", "मित्तल कलेक्शंस होम फर्निशिंग");

  const goPrev = () =>
    setActiveIndex((prev) => (prev - 1 + allSlides.length) % allSlides.length);

  const goNext = () => setActiveIndex((prev) => (prev + 1) % allSlides.length);

  return (
    <>
      <div className="hero-value-strip">
        {t(
          "Mittal Collections — Quality Home Furnishing at Great Prices",
          "मित्तल कलेक्शन्स — बेहतरीन कीमतों पर क्वालिटी होम फर्निशिंग",
        )}
      </div>

      <section className={`hero ${slide.isRewardsSlide ? "hero-rewards-slide" : ""}`}>
      {slide.isRewardsSlide ? (
        <div className="hero-bg-image hero-bg-rewards">
          <span className="hero-bg-blob hero-bg-blob-1" />
          <span className="hero-bg-blob hero-bg-blob-2" />
        </div>
      ) : (
        <img src={backgroundImage} alt={imageAlt} className="hero-bg-image" />
      )}
      <div className={`hero-overlay ${slide.isRewardsSlide ? "hero-overlay-rewards" : ""}`}>
        <div className="container">
          {slide.isRewardsSlide ? (
            <div className="hero-rewards-content">
              <div className="hero-rewards-heading">
                <span className="hero-rewards-badge">
                  <span className="hero-rewards-badge-icon">
                    <FaGift />
                  </span>
                  {t(slide.subtitle, slide.subtitleHi)}
                </span>
                <h2>{slideTitle}</h2>
              </div>

              <div className="hero-rewards-cards">
                {slide.benefits.map((b) => (
                  <div className="hero-rewards-card" key={b.title}>
                    <span className={`hero-rewards-card-icon hero-rewards-icon-${b.theme}`}>
                      {b.icon}
                    </span>
                    <h3>{b.title}</h3>
                    <p>{b.text}</p>
                  </div>
                ))}
              </div>

              <div className="hero-rewards-cta-wrap">
                <button
                  type="button"
                  onClick={() => navigate(slide.button1Link)}
                  className="hero-rewards-cta"
                >
                  {t(slide.button1Label, slide.button1LabelHi)}
                  <FaArrowRight className="text-xs" />
                </button>
              </div>
            </div>
          ) : (
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
          )}
        </div>

        {allSlides.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("Previous slide", "पिछली स्लाइड")}
              className={`hero-arrow hero-arrow-left ${slide.isRewardsSlide ? "hero-arrow-light" : ""}`}
            >
              <FaChevronLeft />
            </button>

            <button
              type="button"
              onClick={goNext}
              aria-label={t("Next slide", "अगली स्लाइड")}
              className={`hero-arrow hero-arrow-right ${slide.isRewardsSlide ? "hero-arrow-light" : ""}`}
            >
              <FaChevronRight />
            </button>

            <div className={`hero-dots ${slide.isRewardsSlide ? "hero-dots-light" : ""}`}>
              {allSlides.map((s, i) => (
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
