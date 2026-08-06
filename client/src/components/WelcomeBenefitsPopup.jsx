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

  // Show once per session, shortly after the site opens.
  useEffect(() => {
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return;

    const timer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(SHOWN_KEY, "1");
    }, SHOW_AFTER_MS);

    return () => clearTimeout(timer);
  }, []);

  // Also show right after a successful login, even if already shown
  // earlier this session.
  useEffect(() => {
    if (!justLoggedIn) return;

    setVisible(true);
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
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 transition-all duration-300 ${
          entered ? "scale-100 translate-y-0" : "scale-95 translate-y-3"
        }`}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <FaTimes />
        </button>

        <h2 className="text-xl font-bold text-slate-900 mb-1">
          Welcome to Mittal Collections!
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          Here&apos;s what you get when you shop with us:
        </p>

        <ul className="space-y-3 mb-6">
          {benefits.map((b, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-9 h-9 shrink-0 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                {b.icon}
              </span>
              <span className="text-sm text-slate-700">{b.text}</span>
            </li>
          ))}
        </ul>

        <Link
          to={isLoggedIn ? "/account" : "/register"}
          onClick={handleClose}
          className="block text-center bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full py-3 transition-colors"
        >
          {isLoggedIn ? "See My Rewards" : "Sign Up & Start Earning"}
        </Link>
      </div>
    </div>
  );
}

export default WelcomeBenefitsPopup;
