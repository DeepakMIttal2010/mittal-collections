import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaGift,
  FaCoins,
  FaUserFriends,
  FaPen,
  FaBoxOpen,
  FaUserCircle,
  FaHistory,
} from "react-icons/fa";

import Seo from "../components/Seo";
import "../components/Hero/Hero.css";
import { getPublicRewardsInfo } from "../services/rewardsService";
import { getBannerCoupon } from "../services/couponService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function Rewards() {
  const { t } = useLanguage();
  const { isLoggedIn } = useAuth();
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

  if (!rewards) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500">
        {t("Loading...", "लोड हो रहा है...")}
      </div>
    );
  }

  const couponLabel = coupon
    ? coupon.discountType === "flat"
      ? t(`₹${coupon.discountValue} OFF`, `₹${coupon.discountValue} की छूट`)
      : t(`${coupon.discountValue}% OFF`, `${coupon.discountValue}% की छूट`)
    : null;

  const sections = [
    coupon && {
      icon: <FaGift />,
      theme: "rose",
      title: t("Welcome Offer", "वेलकम ऑफर"),
      points: [
        t(
          `${couponLabel} on your very first order${coupon.maxDiscount ? `, up to a maximum of ₹${coupon.maxDiscount}` : ""}.`,
          `आपके पहले ऑर्डर पर ${couponLabel}${coupon.maxDiscount ? `, अधिकतम ₹${coupon.maxDiscount} तक` : ""}।`,
        ),
        t(
          `Enter the code ${coupon.code} at checkout to apply it.`,
          `चेकआउट पर कोड ${coupon.code} डालकर इसे लागू करें।`,
        ),
        t(
          "Valid once per account, on your first order only.",
          "प्रति खाता एक बार, केवल आपके पहले ऑर्डर पर मान्य।",
        ),
      ],
    },
    {
      icon: <FaCoins />,
      theme: "amber",
      title: t("Loyalty Points", "लॉयल्टी पॉइंट्स"),
      points: [
        t(
          `Earn 1 point for every ₹${rewards.loyalty.earnRate} you spend.`,
          `हर ₹${rewards.loyalty.earnRate} खर्च पर 1 पॉइंट कमाएं।`,
        ),
        t(
          "Points are credited automatically once your order is delivered.",
          "ऑर्डर डिलीवर होने पर पॉइंट्स अपने आप क्रेडिट हो जाते हैं।",
        ),
        t(
          `Each point is worth ₹${rewards.loyalty.redeemValue} off at checkout.`,
          `हर पॉइंट चेकआउट पर ₹${rewards.loyalty.redeemValue} की छूट के बराबर है।`,
        ),
        t(
          `Points can cover up to ${Math.round(rewards.loyalty.maxRedeemPercent * 100)}% of an order — you need at least ${rewards.loyalty.minRedeemPoints} points to redeem.`,
          `पॉइंट्स ऑर्डर के ${Math.round(rewards.loyalty.maxRedeemPercent * 100)}% तक कवर कर सकते हैं — रिडीम करने के लिए कम से कम ${rewards.loyalty.minRedeemPoints} पॉइंट्स चाहिए।`,
        ),
        t(
          `Points expire after ${rewards.loyalty.expiryMonths} months of inactivity.`,
          `${rewards.loyalty.expiryMonths} महीने तक इस्तेमाल न होने पर पॉइंट्स समाप्त हो जाते हैं।`,
        ),
      ],
    },
    {
      icon: <FaUserFriends />,
      theme: "indigo",
      title: t("Refer & Earn", "रेफर करें और कमाएं"),
      points: [
        t(
          `Share your referral link with a friend who hasn't shopped here yet.`,
          `अपना रेफरल लिंक उस दोस्त के साथ शेयर करें जिसने अभी तक यहां से खरीदारी नहीं की है।`,
        ),
        t(
          "They sign up using your link and place an order — no separate code needed.",
          "वे आपके लिंक से खाता बनाकर ऑर्डर करते हैं — अलग से कोड की ज़रूरत नहीं।",
        ),
        t(
          `Once their first order is delivered, you get ${rewards.referral.referrerPoints} points and they get ${rewards.referral.referredPoints} points, automatically.`,
          `उनका पहला ऑर्डर डिलीवर होते ही, आपको ${rewards.referral.referrerPoints} पॉइंट्स और उन्हें ${rewards.referral.referredPoints} पॉइंट्स अपने आप मिल जाते हैं।`,
        ),
        t(
          "Find your referral link on your Account page once you're logged in.",
          "लॉगिन करने के बाद अपना रेफरल लिंक अपने खाता पेज पर पाएं।",
        ),
      ],
    },
    {
      icon: <FaPen />,
      theme: "teal",
      title: t("Review & Earn", "रिव्यू करें और कमाएं"),
      points: [
        t(
          `Bought something? Write a review and earn up to ${rewards.reviewBonusPoints} points on that order.`,
          `कुछ खरीदा है? रिव्यू लिखें और उस ऑर्डर पर ${rewards.reviewBonusPoints} तक पॉइंट्स कमाएं।`,
        ),
        t(
          "Reviews can only be submitted for products you've actually ordered.",
          "रिव्यू केवल उन प्रोडक्ट्स के लिए दिया जा सकता है जो आपने वाकई ऑर्डर किए हैं।",
        ),
        t(
          "Add photos or a short video with your review to help other shoppers.",
          "अन्य ग्राहकों की मदद के लिए अपने रिव्यू के साथ फ़ोटो या छोटा वीडियो जोड़ें।",
        ),
      ],
    },
  ].filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Seo
        title="Rewards Program — Earn While You Shop"
        description="How Mittal Collections' rewards program works: welcome offer, loyalty points, referrals and review bonuses."
        url="https://www.mittalcollections.com/rewards"
      />

      <div className="text-center mb-12">
        <span className="inline-flex items-center gap-2 bg-rose-50 text-rose-700 text-xs font-bold tracking-wide px-4 py-2 rounded-full mb-4">
          <FaGift />
          {t("REWARDS PROGRAM", "रिवॉर्ड्स प्रोग्राम")}
        </span>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
          {t("Earn While You Shop", "खरीदारी करें और कमाएं")}
        </h1>
        <p className="text-slate-500 max-w-xl mx-auto">
          {t(
            "Every order, referral and review adds up to real rewards — here's exactly how each one works.",
            "हर ऑर्डर, रेफरल और रिव्यू आपको असली रिवॉर्ड्स देता है — यहां बताया गया है कि हर एक कैसे काम करता है।",
          )}
        </p>
        <Link
          to="/policies/terms-and-conditions"
          className="inline-block text-xs text-slate-400 underline hover:text-slate-600 mt-2"
        >
          {t("*Terms & Conditions apply", "*नियम व शर्तें लागू")}
        </Link>
      </div>

      <div className="space-y-6 mb-14">
        {sections.map((section) => (
          <div
            key={section.title}
            className={`border rounded-2xl p-6 md:p-7 hero-rewards-theme-${section.theme}`}
          >
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-lg hero-rewards-icon-${section.theme}`}
              >
                {section.icon}
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                {section.title}
              </h2>
            </div>

            <ul className="space-y-2.5">
              {section.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-10">
        <h2 className="text-center text-lg font-semibold text-slate-800 mb-5">
          {isLoggedIn
            ? t("Keep going", "आगे बढ़ते रहें")
            : t("Ready to start earning?", "कमाना शुरू करने के लिए तैयार हैं?")}
        </h2>

        <div className="flex flex-wrap justify-center gap-3">
          {isLoggedIn ? (
            <>
              <Link
                to="/account"
                className="flex items-center gap-2 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
              >
                <FaUserCircle />
                {t("My Account", "मेरा खाता")}
              </Link>
              <Link
                to="/loyalty-history"
                className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-full px-6 py-3 transition-colors"
              >
                <FaHistory />
                {t("Points History", "पॉइंट्स हिस्ट्री")}
              </Link>
              <Link
                to="/my-orders"
                className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-full px-6 py-3 transition-colors"
              >
                <FaBoxOpen />
                {t("My Orders", "मेरे ऑर्डर")}
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/register"
                className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3 transition-colors"
              >
                {t("Create Account", "खाता बनाएं")}
              </Link>
              <Link
                to="/login"
                className="border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-full px-8 py-3 transition-colors"
              >
                {t("Already have an account? Login", "पहले से खाता है? लॉगिन करें")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Rewards;
