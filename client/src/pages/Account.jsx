import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaBoxOpen,
  FaHeart,
  FaUserEdit,
  FaLock,
  FaMapMarkerAlt,
  FaGift,
  FaUserFriends,
  FaCopy,
  FaTicketAlt,
  FaUndoAlt,
  FaSignOutAlt,
  FaBell,
} from "react-icons/fa";
import { FaWhatsapp } from "react-icons/fa6";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getProfile } from "../services/authService";
import { getPublicRewardsInfo } from "../services/rewardsService";
import { getMyNotifications } from "../services/notificationService";

function getAccountLinks(t) {
  return [
    {
      to: "/my-orders",
      icon: FaBoxOpen,
      title: t("Your Orders", "आपके ऑर्डर"),
      description: t(
        "Track, view status and check your order history",
        "अपने ऑर्डर को ट्रैक करें, स्टेटस देखें और ऑर्डर हिस्ट्री जांचें",
      ),
    },
    {
      to: "/wishlist",
      icon: FaHeart,
      title: t("Wishlist", "विशलिस्ट"),
      description: t(
        "View and manage items you've saved for later",
        "आपके सहेजे गए आइटम देखें और प्रबंधित करें",
      ),
    },
    {
      to: "/addresses",
      icon: FaMapMarkerAlt,
      title: t("Your Addresses", "आपके पते"),
      description: t(
        "Edit, remove or set a default address",
        "पता एडिट करें, हटाएं या डिफ़ॉल्ट पता सेट करें",
      ),
    },
    {
      to: "/tickets",
      icon: FaTicketAlt,
      title: t("Support Tickets", "सपोर्ट टिकट"),
      description: t(
        "Raise an issue and chat with our support team",
        "समस्या दर्ज करें और हमारी सपोर्ट टीम से चैट करें",
      ),
    },
    {
      to: "/returns",
      icon: FaUndoAlt,
      title: t("Your Returns", "आपके रिटर्न"),
      description: t(
        "Track the status of items you've returned",
        "आपके रिटर्न किए गए आइटम का स्टेटस ट्रैक करें",
      ),
    },
    {
      to: "/edit-profile",
      icon: FaUserEdit,
      title: t("Edit Profile", "प्रोफ़ाइल एडिट करें"),
      description: t(
        "Update your name and mobile number",
        "अपना नाम और मोबाइल नंबर अपडेट करें",
      ),
    },
    {
      to: "/change-password",
      icon: FaLock,
      title: t("Change Password", "पासवर्ड बदलें"),
      description: t("Update your account password", "अपने खाते का पासवर्ड अपडेट करें"),
    },
  ];
}

function Account() {
  const { user, isLoggedIn, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loyaltyPoints, setLoyaltyPoints] = useState(user?.loyaltyPoints || 0);
  const [referralCode, setReferralCode] = useState(user?.referralCode || "");
  const [unreadCount, setUnreadCount] = useState(0);
  const [rewards, setRewards] = useState({
    loyalty: {
      earnRate: 20,
      redeemValue: 1,
      maxRedeemPercent: 0.5,
      minRedeemPoints: 50,
    },
    referral: { referrerPoints: 100, referredPoints: 50 },
  });

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/account");
      return;
    }

    getProfile().then((response) => {
      if (response.success) {
        setLoyaltyPoints(response.user.loyaltyPoints || 0);
        setReferralCode(response.user.referralCode || "");
      }
    });

    getPublicRewardsInfo().then((response) => {
      if (response.success) {
        setRewards({ loyalty: response.loyalty, referral: response.referral });
      }
    });

    getMyNotifications().then((response) => {
      if (response.success) setUnreadCount(response.unreadCount);
    });
  }, [isLoggedIn, navigate]);

  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : "";

  const handleCopyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success(t("Referral link copied!", "रेफरल लिंक कॉपी हो गया!"));
  };

  const accountLinks = getAccountLinks(t);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            {t("Your Account", "आपका खाता")}
          </h1>
          <p className="text-slate-500">{t("Hi, ", "नमस्ते, ")}{user?.name}</p>
        </div>

        <Link
          to="/notifications"
          title={t("Alerts", "अलर्ट")}
          className="relative shrink-0 w-11 h-11 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-300 flex items-center justify-center text-lg transition-colors"
        >
          <FaBell />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <Link to="/loyalty-history" className="flex items-center gap-4 mb-3">
            <span className="w-12 h-12 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg">
              <FaGift />
            </span>
            <span>
              <span className="block font-semibold text-slate-800">
                {t(`${loyaltyPoints} Loyalty Points`, `${loyaltyPoints} लॉयल्टी पॉइंट्स`)}
              </span>
              <span className="block text-sm text-slate-500 mt-0.5">
                {t(
                  `Worth ₹${loyaltyPoints * rewards.loyalty.redeemValue} — tap to see your points history`,
                  `₹${loyaltyPoints * rewards.loyalty.redeemValue} मूल्य — अपनी पॉइंट्स हिस्ट्री देखने के लिए टैप करें`,
                )}
              </span>
            </span>
          </Link>

          <ul className="text-xs text-slate-600 space-y-1 bg-white/60 rounded-lg p-3">
            <li>
              <strong>{t("Earn:", "कमाएं:")}</strong>{" "}
              {t(
                `1 point for every ₹${rewards.loyalty.earnRate} you spend, credited once your order is delivered.`,
                `आपके हर ₹${rewards.loyalty.earnRate} खर्च पर 1 पॉइंट, जो ऑर्डर डिलीवर होने पर क्रेडिट होता है।`,
              )}
            </li>
            <li>
              <strong>{t("Use:", "उपयोग:")}</strong>{" "}
              {t(
                `Each point is worth ₹${rewards.loyalty.redeemValue} off at checkout.`,
                `चेकआउट पर हर पॉइंट ₹${rewards.loyalty.redeemValue} की छूट के बराबर है।`,
              )}
            </li>
            <li>
              <strong>{t("Limit:", "सीमा:")}</strong>{" "}
              {t(
                `Points can cover up to ${Math.round(rewards.loyalty.maxRedeemPercent * 100)}% of an order, and you need at least ${rewards.loyalty.minRedeemPoints} points to redeem.`,
                `पॉइंट्स ऑर्डर के ${Math.round(rewards.loyalty.maxRedeemPercent * 100)}% तक कवर कर सकते हैं, और रिडीम करने के लिए कम से कम ${rewards.loyalty.minRedeemPoints} पॉइंट्स ज़रूरी हैं।`,
              )}
            </li>
          </ul>
        </div>

        {referralCode && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-center gap-4 mb-3">
              <span className="w-12 h-12 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg">
                <FaUserFriends />
              </span>
              <span>
                <span className="block font-semibold text-slate-800">
                  {t("Refer a Friend", "दोस्त को रेफर करें")}
                </span>
                <span className="block text-sm text-slate-500 mt-0.5">
                  {t(
                    `You get ${rewards.referral.referrerPoints} points, they get ${rewards.referral.referredPoints} — after their first order`,
                    `आपको ${rewards.referral.referrerPoints} पॉइंट्स मिलेंगे, उन्हें ${rewards.referral.referredPoints} — उनके पहले ऑर्डर के बाद`,
                  )}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyReferralLink}
              className="w-full flex items-center justify-between gap-2 bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 transition-colors mb-2"
            >
              <span className="truncate">{referralLink}</span>
              <FaCopy className="shrink-0" />
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Shop at Mittal Collections and get ${rewards.referral.referredPoints} bonus loyalty points on your first order! ${referralLink}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors mb-3"
            >
              <FaWhatsapp />
              {t("Share on WhatsApp", "WhatsApp पर शेयर करें")}
            </a>

            <ul className="text-xs text-slate-600 space-y-1 bg-white/60 rounded-lg p-3">
              <li>
                {t(
                  "Share your link with a friend who hasn't shopped here yet.",
                  "अपना लिंक उस दोस्त के साथ शेयर करें जिसने अभी तक यहां से खरीदारी नहीं की है।",
                )}
              </li>
              <li>
                {t(
                  "They sign up using your link and place an order — no separate code entry needed since it's built into the link.",
                  "वे आपके लिंक से साइन अप करके ऑर्डर करते हैं — अलग से कोड डालने की ज़रूरत नहीं क्योंकि यह लिंक में ही शामिल है।",
                )}
              </li>
              <li>
                {t(
                  `Once their first order is delivered, you get ${rewards.referral.referrerPoints} points and they get ${rewards.referral.referredPoints} points, automatically.`,
                  `उनका पहला ऑर्डर डिलीवर होते ही, आपको ${rewards.referral.referrerPoints} पॉइंट्स और उन्हें ${rewards.referral.referredPoints} पॉइंट्स अपने आप मिल जाएंगे।`,
                )}
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {accountLinks.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="flex gap-4 items-start bg-white border border-slate-200 rounded-xl p-5 hover:border-amber-400 hover:shadow-md transition-all"
          >
            <span className="w-12 h-12 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg">
              <Icon />
            </span>

            <span>
              <span className="block font-semibold text-slate-800">
                {title}
              </span>
              <span className="block text-sm text-slate-500 mt-1">
                {description}
              </span>
            </span>
          </Link>
        ))}

        <button
          type="button"
          onClick={logout}
          className="flex gap-4 items-start bg-white border border-slate-200 rounded-xl p-5 hover:border-red-400 hover:shadow-md transition-all text-left"
        >
          <span className="w-12 h-12 shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-lg">
            <FaSignOutAlt />
          </span>

          <span>
            <span className="block font-semibold text-slate-800">
              {t("Logout", "लॉगआउट")}
            </span>
            <span className="block text-sm text-slate-500 mt-1">
              {t("Sign out of your account on this device", "इस डिवाइस पर अपने खाते से साइन आउट करें")}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

export default Account;
