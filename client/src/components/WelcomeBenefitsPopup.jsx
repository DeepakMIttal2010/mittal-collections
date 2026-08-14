import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaTimes,
  FaCheckCircle,
  FaTruck,
  FaGift,
  FaUserFriends,
  FaLock,
  FaUndoAlt,
} from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { getPublicRewardsInfo } from "../services/rewardsService";
import { getSiteSettings } from "../services/settingsService";

const SHOWN_KEY = "mc_welcome_popup_shown_at";
const SUPPRESS_MS = 24 * 60 * 60 * 1000; // 24 hours
const SHOW_AFTER_MS = 2500;
const AUTO_CLOSE_MS = 5000;

// previewMode + onClose let AdminSettings show this exact component
// on-demand (bypassing login/suppression/timing) so an admin can see
// precisely what a customer sees, without needing to open an incognito
// window or clear localStorage.
function WelcomeBenefitsPopup({ previewMode = false, onClose } = {}) {
  const { isLoggedIn, justLoggedIn, clearJustLoggedIn } = useAuth();
  const [rewards, setRewards] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setRewards(response);
    });

    getSiteSettings().then((response) => {
      if (response.success) {
        setEnabled(response.settings.welcomePopupEnabled !== false);
      }
    });
  }, []);

  // Show at most once every 24 hours, shortly after the site opens —
  // only for guests. Registered customers already know what the account
  // offers, so the sign-up pitch would be redundant for them. 24h (not a
  // one-time-ever suppression) because this is a new, low-traffic site —
  // every repeat visit is still a real conversion opportunity worth a
  // nudge, so we don't want to silence it for a full week the first time
  // someone closes it.
  useEffect(() => {
    if (previewMode) {
      setVisible(true);
      return;
    }

    if (isLoggedIn || !enabled) return;

    const lastShown = Number(localStorage.getItem(SHOWN_KEY) || 0);
    if (Date.now() - lastShown < SUPPRESS_MS) return;

    const timer = setTimeout(() => {
      setVisible(true);
      localStorage.setItem(SHOWN_KEY, String(Date.now()));
    }, SHOW_AFTER_MS);

    return () => clearTimeout(timer);
  }, [isLoggedIn, enabled, previewMode]);

  // Clear the just-logged-in flag without showing the popup — an
  // existing account logging in isn't a new-visitor moment.
  useEffect(() => {
    if (!justLoggedIn) return;

    clearJustLoggedIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justLoggedIn]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(timer);
  }, [visible]);

  const handleClose = () => {
    setEntered(false);
    setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, 300);
  };

  // Auto-dismiss shortly after it finishes appearing, so it doesn't
  // block the page if the visitor doesn't interact with it. Not in
  // preview mode — an admin reviewing it wants it to stay put.
  useEffect(() => {
    if (!entered || previewMode) return;

    const timer = setTimeout(handleClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, previewMode]);

  if (!visible || !rewards) return null;

  const benefits = [
    { icon: <FaCheckCircle />, text: "100% Genuine Products" },
    {
      icon: <FaTruck />,
      text: "Free Delivery Within 24 Hours — Vasundhara & nearby 10 km",
    },
    {
      icon: <FaGift />,
      text: `Earn 1 Point for every ₹${rewards.loyalty.earnRate} you spend${
        rewards.loyalty.redeemValue === 1 ? " — ₹1 = 1 Reward Point" : ""
      }`,
    },
    {
      icon: <FaUserFriends />,
      text: `Refer a Friend — get ${rewards.referral.referrerPoints} points, they get ${rewards.referral.referredPoints}`,
    },
    { icon: <FaLock />, text: "Secure Payments" },
    { icon: <FaUndoAlt />, text: "Easy Returns" },
  ];

  return (
    <div
      className={`fixed inset-0 z-[95] flex items-center justify-center p-4 transition-opacity duration-300 ${
        entered ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        onClick={handleClose}
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
      />

      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-300 ${
          entered ? "scale-100 translate-y-0" : "scale-95 translate-y-3"
        }`}
      >
        <div className="relative bg-gradient-to-r from-orange-600 to-amber-500 px-5 pt-5 pb-6 overflow-hidden">
          <div className="absolute -top-6 -right-8 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-white/10" />

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          >
            <FaTimes className="text-sm" />
          </button>

          <span className="relative inline-flex w-9 h-9 rounded-full bg-white/20 text-white items-center justify-center text-base mb-2">
            <FaGift />
          </span>

          <h2 className="relative text-lg font-bold text-white mb-0.5">
            Welcome to Mittal Collections!
          </h2>
          <p className="relative text-xs text-amber-50">
            Here&apos;s what you get when you shop with us:
          </p>
        </div>

        <div className="px-5 pt-4 pb-5">
          <ul className="space-y-2 mb-4">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <span className="w-7 h-7 shrink-0 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-sm">
                  {b.icon}
                </span>
                <span className="text-xs text-slate-700">{b.text}</span>
              </li>
            ))}
          </ul>

          <Link
            to={isLoggedIn ? "/account" : "/register"}
            onClick={handleClose}
            className="block text-center bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white text-sm font-semibold rounded-full py-2.5 transition-colors"
          >
            {isLoggedIn ? "See My Rewards" : "Sign Up & Start Earning"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default WelcomeBenefitsPopup;
