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

const SHOWN_KEY = "mc_welcome_popup_shown";
const SHOW_AFTER_MS = 2500;
const AUTO_CLOSE_MS = 5000;

function WelcomeBenefitsPopup() {
  const { isLoggedIn, justLoggedIn, clearJustLoggedIn } = useAuth();
  const [rewards, setRewards] = useState(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setRewards(response);
    });
  }, []);

  // Show once per session, shortly after the site opens — only for
  // guests. Registered customers already know what the account offers,
  // so the sign-up pitch would be redundant for them.
  useEffect(() => {
    if (isLoggedIn) return;
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return;

    const timer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(SHOWN_KEY, "1");
    }, SHOW_AFTER_MS);

    return () => clearTimeout(timer);
  }, [isLoggedIn]);

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
    setTimeout(() => setVisible(false), 300);
  };

  // Auto-dismiss shortly after it finishes appearing, so it doesn't
  // block the page if the visitor doesn't interact with it.
  useEffect(() => {
    if (!entered) return;

    const timer = setTimeout(handleClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  if (!visible || !rewards) return null;

  const benefits = [
    { icon: <FaCheckCircle />, text: "100% Genuine Products" },
    {
      icon: <FaTruck />,
      text: "Free Home Delivery in Vasundhara & 10km around",
    },
    {
      icon: <FaGift />,
      text: `Earn 1 Loyalty Point for every ₹${rewards.loyalty.earnRate} you spend`,
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
        <div className="relative bg-gradient-to-r from-orange-600 to-amber-500 px-6 pt-6 pb-8 overflow-hidden">
          <div className="absolute -top-6 -right-8 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-white/10" />

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          >
            <FaTimes />
          </button>

          <span className="relative inline-flex w-11 h-11 rounded-full bg-white/20 text-white items-center justify-center text-xl mb-3">
            <FaGift />
          </span>

          <h2 className="relative text-xl font-bold text-white mb-1">
            Welcome to Mittal Collections!
          </h2>
          <p className="relative text-sm text-amber-50">
            Here&apos;s what you get when you shop with us:
          </p>
        </div>

        <div className="px-6 pt-5 pb-6">
          <ul className="space-y-3 mb-6">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-9 h-9 shrink-0 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
                  {b.icon}
                </span>
                <span className="text-sm text-slate-700">{b.text}</span>
              </li>
            ))}
          </ul>

          <Link
            to={isLoggedIn ? "/account" : "/register"}
            onClick={handleClose}
            className="block text-center bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white text-sm font-semibold rounded-full py-3 transition-colors"
          >
            {isLoggedIn ? "See My Rewards" : "Sign Up & Start Earning"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default WelcomeBenefitsPopup;
