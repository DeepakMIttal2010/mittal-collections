import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaGift, FaCoins, FaUserFriends, FaPen, FaArrowRight } from "react-icons/fa";

import "./RewardsStrip.css";
import "../Hero/Hero.css";
import { getPublicRewardsInfo } from "../../services/rewardsService";
import { getBannerCoupon } from "../../services/couponService";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

// Was originally the last slide in Hero's rotation (see Hero.jsx git
// history) — moved into its own always-visible homepage section instead,
// since a rotating slide only showed roughly 1-in-N of the time and
// competed for height/layout with the photo slides. A fixed section
// here means every homepage visitor who scrolls past Hero actually
// sees it, not just whoever happens to be looking when it rotates in.
function RewardsStrip() {
  const [rewards, setRewards] = useState(null);
  const [coupon, setCoupon] = useState(null);
  const { t } = useLanguage();
  const { isLoggedIn } = useAuth();

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
      subtitle: t(
        `${couponLabel} on your first order`,
        `पहले ऑर्डर पर ${couponLabel}`,
      ),
    },
    {
      icon: <FaCoins />,
      theme: "amber",
      title: t("Earn Loyalty Points", "लॉयल्टी पॉइंट्स कमाएं"),
      subtitle: t(
        `1 point per ₹${rewards.loyalty.earnRate} spent`,
        `हर ₹${rewards.loyalty.earnRate} पर 1 पॉइंट`,
      ),
    },
    {
      icon: <FaUserFriends />,
      theme: "indigo",
      title: t("Refer & Earn", "रेफर करें और कमाएं"),
      subtitle: t(
        `${rewards.referral.referrerPoints} points per referral`,
        `हर रेफरल पर ${rewards.referral.referrerPoints} पॉइंट्स`,
      ),
    },
    {
      icon: <FaPen />,
      theme: "teal",
      title: t("Review & Earn", "रिव्यू करें और कमाएं"),
      subtitle: t(
        `Up to ${rewards.reviewBonusPoints} points per review`,
        `प्रति रिव्यू ${rewards.reviewBonusPoints} तक पॉइंट्स`,
      ),
    },
  ].filter(Boolean);

  return (
    <section className="rewards-strip-wrap">
      <div className="rewards-strip-card">
        <div className="rewards-strip-heading">
          <span className="rewards-strip-badge">
            <FaGift />
            {t("REWARDS PROGRAM", "रिवॉर्ड्स प्रोग्राम")}
          </span>
          <h2>{t("Earn While You Shop", "खरीदारी करें और कमाएं")}</h2>
        </div>

        <div className="rewards-strip-items">
          {benefits.map((b) => (
            <div className="rewards-strip-item" key={b.title}>
              <span className={`rewards-strip-icon hero-rewards-icon-${b.theme}`}>
                {b.icon}
              </span>
              <div>
                <div className="rewards-strip-title">{b.title}</div>
                <div className="rewards-strip-subtitle">{b.subtitle}</div>
              </div>
            </div>
          ))}
        </div>

        <Link to="/rewards" className="rewards-strip-cta">
          {isLoggedIn
            ? t("View My Rewards", "मेरे रिवॉर्ड देखें")
            : t("Start Earning", "कमाना शुरू करें")}
          <FaArrowRight className="text-xs" />
        </Link>
      </div>
    </section>
  );
}

export default RewardsStrip;
